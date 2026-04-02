import { Body, Controller, Param, Post } from '@nestjs/common';
import { ExecutionLog, FlowExecutionService } from './flow-execution.service';

@Controller('flow')
export class FlowWebhookController {
  constructor(private readonly flowExecutionService: FlowExecutionService) {}

  @Post('webhook/:flowId')
  executeWebhook(
    @Param('flowId') flowId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ success: boolean; logs: ExecutionLog[] }> {
    return this.flowExecutionService.executeWebhook(flowId, body);
  }
}
