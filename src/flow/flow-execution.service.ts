import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Flow } from './entities/flow.entity';
import { FlowService } from './flow.service';

// ─── Internal types for execution ────────────────────────────────

interface FlowNode {
  id: string;
  type: 'trigger' | 'action' | 'conditional';
  data: Record<string, unknown>;
}

interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
}

interface FlowVariable {
  id: string;
  name: string;
  type: string;
}

export interface ExecutionLog {
  nodeId: string;
  nodeName: string;
  type: string;
  status: 'success' | 'error' | 'skipped';
  message?: string;
  timestamp: string;
}

@Injectable()
export class FlowExecutionService {
  private readonly logger = new Logger(FlowExecutionService.name);

  constructor(
    private readonly flowService: FlowService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Main entry point: load flow by ID and execute the graph
   */
  async executeWebhook(
    flowId: string,
    payload: Record<string, unknown>,
  ): Promise<{ success: boolean; logs: ExecutionLog[] }> {
    const flow = await this.flowService.findFlowById(flowId);

    if (!flow) {
      throw new NotFoundException(`Flow con id "${flowId}" no encontrado`);
    }

    if (!flow.isActive) {
      throw new NotFoundException(`Flow con id "${flowId}" está inactivo`);
    }

    const nodes: FlowNode[] = (flow.nodes as FlowNode[]) || [];
    const edges: FlowEdge[] = (flow.edges as FlowEdge[]) || [];
    const variables: FlowVariable[] = (flow.variables as FlowVariable[]) || [];

    const variableMap = this.buildVariableMap(variables, payload);
    const adjacency = this.buildAdjacency(edges);

    const triggerNode = nodes.find((n) => n.type === 'trigger');
    if (!triggerNode) {
      return {
        success: false,
        logs: [
          this.logEntry(
            'N/A',
            'N/A',
            'trigger',
            'error',
            'No se encontró un nodo trigger',
          ),
        ],
      };
    }

    const logs: ExecutionLog[] = [];
    logs.push(
      this.logEntry(
        triggerNode.id,
        (triggerNode.data.label as string) || 'Trigger',
        'trigger',
        'success',
        `Webhook recibido con payload: ${JSON.stringify(payload).substring(0, 200)}`,
      ),
    );

    await this.traverseFromNode(
      triggerNode.id,
      'bottom',
      nodes,
      adjacency,
      variableMap,
      flow,
      logs,
    );

    return { success: true, logs };
  }

  // ─── Graph Building ────────────────────────────────────────────

  private buildVariableMap(
    variables: FlowVariable[],
    payload: Record<string, unknown>,
  ): Map<string, unknown> {
    const map = new Map<string, unknown>();
    for (const v of variables) {
      map.set(v.id, undefined);
    }
    for (const v of variables) {
      if (payload[v.name] !== undefined) {
        map.set(v.id, payload[v.name]);
      }
    }
    return map;
  }

  private buildAdjacency(
    edges: FlowEdge[],
  ): Map<string, { targetId: string; sourceHandle?: string }[]> {
    const adj = new Map<
      string,
      { targetId: string; sourceHandle?: string }[]
    >();
    for (const edge of edges) {
      const list = adj.get(edge.source) || [];
      list.push({ targetId: edge.target, sourceHandle: edge.sourceHandle });
      adj.set(edge.source, list);
    }
    return adj;
  }

  // ─── Graph Traversal ───────────────────────────────────────────

  private async traverseFromNode(
    nodeId: string,
    fromHandle: string | undefined,
    nodes: FlowNode[],
    adjacency: Map<string, { targetId: string; sourceHandle?: string }[]>,
    variableMap: Map<string, unknown>,
    flow: Flow,
    logs: ExecutionLog[],
  ): Promise<void> {
    const outgoing = adjacency.get(nodeId) || [];
    const nextEdges = fromHandle
      ? outgoing.filter((e) => e.sourceHandle === fromHandle)
      : outgoing;

    for (const edge of nextEdges) {
      const targetNode = nodes.find((n) => n.id === edge.targetId);
      if (!targetNode) continue;

      if (targetNode.type === 'action') {
        await this.executeActionNode(targetNode, variableMap, flow, logs);
        await this.traverseFromNode(
          targetNode.id,
          'bottom',
          nodes,
          adjacency,
          variableMap,
          flow,
          logs,
        );
      } else if (targetNode.type === 'conditional') {
        await this.executeConditionalNode(
          targetNode,
          nodes,
          adjacency,
          variableMap,
          flow,
          logs,
        );
      }
    }
  }

  // ─── Action Node Execution ────────────────────────────────────

  private async executeActionNode(
    node: FlowNode,
    variableMap: Map<string, unknown>,
    flow: Flow,
    logs: ExecutionLog[],
  ): Promise<void> {
    const actionType = node.data.actionType as string;
    const label = (node.data.label as string) || 'Action';

    try {
      switch (actionType) {
        case 'SEND_EMAIL':
          await this.executeSendEmail(node, variableMap, logs);
          break;
        case 'SEND_NOTIFICATION':
          await this.executeSendNotification(node, flow, logs);
          break;
        case 'WEBHOOK':
          await this.executeOutgoingWebhook(node, variableMap, logs);
          break;
        case 'PROCESS_DATA':
          this.executeProcessData(node, variableMap, logs);
          break;
        default:
          logs.push(
            this.logEntry(
              node.id,
              label,
              'action',
              'error',
              `Tipo de acción desconocido: ${actionType}`,
            ),
          );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error ejecutando nodo ${node.id}: ${msg}`);
      logs.push(this.logEntry(node.id, label, 'action', 'error', msg));
    }
  }

  // ─── SEND_EMAIL ────────────────────────────────────────────────

  private async executeSendEmail(
    node: FlowNode,
    variableMap: Map<string, unknown>,
    logs: ExecutionLog[],
  ): Promise<void> {
    const config = node.data.emailConfig as Record<string, string> | undefined;
    const label = (node.data.label as string) || 'Enviar Correo';

    if (!config) {
      logs.push(
        this.logEntry(
          node.id,
          label,
          'SEND_EMAIL',
          'error',
          'emailConfig no definido',
        ),
      );
      return;
    }

    const receiverValue = this.resolveVariable(
      config.receiverVariableId,
      variableMap,
    );

    if (!receiverValue || typeof receiverValue !== 'string') {
      logs.push(
        this.logEntry(
          node.id,
          label,
          'SEND_EMAIL',
          'error',
          `Variable de receptor no encontrada o no es string: ${config.receiverVariableId}`,
        ),
      );
      return;
    }

    await this.emailService.sendEmail(
      receiverValue,
      config.title,
      config.content,
      config.content,
    );

    logs.push(
      this.logEntry(
        node.id,
        label,
        'SEND_EMAIL',
        'success',
        `Correo enviado a ${receiverValue}`,
      ),
    );
  }

  // ─── SEND_NOTIFICATION ─────────────────────────────────────────

  private async executeSendNotification(
    node: FlowNode,
    flow: Flow,
    logs: ExecutionLog[],
  ): Promise<void> {
    const config = node.data.notificationConfig as
      | Record<string, string>
      | undefined;
    const label = (node.data.label as string) || 'Enviar Notificación';

    if (!config) {
      logs.push(
        this.logEntry(
          node.id,
          label,
          'SEND_NOTIFICATION',
          'error',
          'notificationConfig no definido',
        ),
      );
      return;
    }

    await this.notificationsService.create(flow.userId, {
      title: config.title,
      message: config.content,
    });

    logs.push(
      this.logEntry(
        node.id,
        label,
        'SEND_NOTIFICATION',
        'success',
        `Notificación creada para usuario ${flow.userId}`,
      ),
    );
  }

  // ─── WEBHOOK (outgoing) ────────────────────────────────────────

  private async executeOutgoingWebhook(
    node: FlowNode,
    variableMap: Map<string, unknown>,
    logs: ExecutionLog[],
  ): Promise<void> {
    const config = node.data.webhookConfig as
      | Record<string, unknown>
      | undefined;
    const label = (node.data.label as string) || 'Webhook';

    if (!config) {
      logs.push(
        this.logEntry(
          node.id,
          label,
          'WEBHOOK',
          'error',
          'webhookConfig no definido',
        ),
      );
      return;
    }

    const url = config.url as string;
    const method = ((config.method as string) || 'POST').toUpperCase();

    // Build headers
    const headers: Record<string, string> = {};
    const rawHeaders =
      (config.headers as Array<{ key: string; value: string }>) || [];
    for (const h of rawHeaders) {
      headers[h.key] = h.value;
    }

    // Build body
    const bodyEntries =
      (config.body as Array<{
        key: string;
        value: string;
        isVariable: boolean;
      }>) || [];
    const body: Record<string, unknown> = {};
    for (const entry of bodyEntries) {
      body[entry.key] = entry.isVariable
        ? this.resolveVariable(entry.value, variableMap)
        : entry.value;
    }

    const response = await firstValueFrom(
      this.httpService.request({ url, method, headers, data: body }),
    );

    // If hasOutput, store output fields as variables
    if (config.hasOutput) {
      const outputFields =
        (config.outputFields as Array<{ id: string; key: string }>) || [];
      const responseData = response.data as Record<string, unknown>;
      for (const field of outputFields) {
        if (responseData[field.key] !== undefined) {
          variableMap.set(field.id, responseData[field.key]);
        }
      }
    }

    logs.push(
      this.logEntry(
        node.id,
        label,
        'WEBHOOK',
        'success',
        `${method} ${url} → ${String(response.status)}`,
      ),
    );
  }

  // ─── PROCESS_DATA ──────────────────────────────────────────────

  private executeProcessData(
    node: FlowNode,
    variableMap: Map<string, unknown>,
    logs: ExecutionLog[],
  ): void {
    const config = node.data.processDataConfig as
      | Record<string, string>
      | undefined;
    const label = (node.data.label as string) || 'Process Data';

    if (!config?.code) {
      logs.push(
        this.logEntry(
          node.id,
          label,
          'PROCESS_DATA',
          'error',
          'processDataConfig.code no definido',
        ),
      );
      return;
    }

    const acciones = {
      setVariable: (name: string, value: unknown) => {
        for (const [key] of variableMap) {
          variableMap.set(key, value);
          break;
        }
      },
    };

    const salida: Record<string, unknown> = {};
    for (const [key, value] of variableMap) {
      salida[key] = value;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const fn = new Function('salida', 'acciones', config.code) as (
        s: Record<string, unknown>,
        a: typeof acciones,
      ) => void;
      fn(salida, acciones);
      logs.push(
        this.logEntry(
          node.id,
          label,
          'PROCESS_DATA',
          'success',
          'Código ejecutado',
        ),
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logs.push(this.logEntry(node.id, label, 'PROCESS_DATA', 'error', msg));
    }
  }

  // ─── Conditional Node ──────────────────────────────────────────

  private async executeConditionalNode(
    node: FlowNode,
    allNodes: FlowNode[],
    adjacency: Map<string, { targetId: string; sourceHandle?: string }[]>,
    variableMap: Map<string, unknown>,
    flow: Flow,
    logs: ExecutionLog[],
  ): Promise<void> {
    const conditions =
      (node.data.conditions as Array<{
        variableId: string;
        operator: string;
        value: string;
      }>) || [];
    const label = (node.data.label as string) || 'Condicional';

    const allPass = conditions.every((c) =>
      this.evaluateCondition(c, variableMap),
    );

    if (allPass) {
      logs.push(
        this.logEntry(
          node.id,
          label,
          'conditional',
          'success',
          'Todas las condiciones se cumplieron → rama TRUE',
        ),
      );
      await this.traverseFromNode(
        node.id,
        'bottom',
        allNodes,
        adjacency,
        variableMap,
        flow,
        logs,
      );
    } else {
      logs.push(
        this.logEntry(
          node.id,
          label,
          'conditional',
          'success',
          'Condiciones no cumplidas → rama FALSE',
        ),
      );
      await this.traverseFromNode(
        node.id,
        'right',
        allNodes,
        adjacency,
        variableMap,
        flow,
        logs,
      );
    }
  }

  // ─── Condition Evaluation ──────────────────────────────────────

  private evaluateCondition(
    condition: { variableId: string; operator: string; value: string },
    variableMap: Map<string, unknown>,
  ): boolean {
    const actual = variableMap.get(condition.variableId);
    const expected = condition.value;

    const actualStr = this.unknownToString(actual);
    const expectedStr = String(expected);

    switch (condition.operator) {
      case 'equals':
        return actualStr === expectedStr;
      case 'not_equals':
        return actualStr !== expectedStr;
      case 'contains':
        return actualStr.includes(expectedStr);
      case 'starts_with':
        return actualStr.startsWith(expectedStr);
      case 'ends_with':
        return actualStr.endsWith(expectedStr);
      case 'greater_than':
        return Number(actualStr) > Number(expectedStr);
      case 'less_than':
        return Number(actualStr) < Number(expectedStr);
      case 'greater_equal':
        return Number(actualStr) >= Number(expectedStr);
      case 'less_equal':
        return Number(actualStr) <= Number(expectedStr);
      case 'before':
        return new Date(actualStr) < new Date(expectedStr);
      case 'after':
        return new Date(actualStr) > new Date(expectedStr);
      default:
        return false;
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────

  private resolveVariable(
    variableId: string,
    variableMap: Map<string, unknown>,
  ): unknown {
    return variableMap.get(variableId);
  }

  private logEntry(
    nodeId: string,
    nodeName: string,
    type: string,
    status: 'success' | 'error' | 'skipped',
    message?: string,
  ): ExecutionLog {
    return {
      nodeId,
      nodeName,
      type,
      status,
      message,
      timestamp: new Date().toISOString(),
    };
  }

  private unknownToString(value: unknown): string {
    if (value == null) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value as string | number | boolean);
  }
}
