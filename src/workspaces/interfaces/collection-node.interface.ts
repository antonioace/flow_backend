export type FieldType = 'text' | 'number' | 'date' | 'boolean';

export interface FieldValidation {
  required?: boolean;
  optional?: boolean;
  minLength?: number; // solo text
  maxLength?: number; // solo text
  min?: number; // solo number
  max?: number; // solo number
}

export type RelationType = 'one_to_one' | 'one_to_many' | 'many_to_one';

export interface FieldRelation {
  targetCollectionId: string;
  targetFieldId?: string;
  type: RelationType;
}

export interface CollectionField {
  id: string;
  name: string;
  type: FieldType;
  validations: FieldValidation;
  relation?: FieldRelation | null;
  isUser?: boolean;
}

export interface CollectionNodeData {
  label: string;
  description?: string;
  fields: CollectionField[];
  [key: string]: any;
}

export interface CollectionNode {
  id: string;
  type?: string;
  data: CollectionNodeData;
  position?: { x: number; y: number };
  [key: string]: any;
}
