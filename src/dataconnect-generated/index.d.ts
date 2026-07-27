import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, ExecuteQueryOptions, MutationRef, MutationPromise, DataConnectSettings } from 'firebase/data-connect';

export const connectorConfig: ConnectorConfig;
export const dataConnectSettings: DataConnectSettings;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;




export interface GetOperationsData {
  user?: {
    name: string;
    email: string;
    address: string;
  };
  posts: ({
    title: string;
    content: string;
  })[];
  items: ({
    name: string;
    status: string;
    description?: string | null;
  })[];
  messages: ({
    content: string;
    timestamp: TimestampString;
  })[];
}

export interface Item_Key {
  id: UUIDString;
  __typename?: 'Item_Key';
}

export interface Message_Key {
  id: UUIDString;
  __typename?: 'Message_Key';
}

export interface Neighborhood_Key {
  id: UUIDString;
  __typename?: 'Neighborhood_Key';
}

export interface Post_Key {
  id: UUIDString;
  __typename?: 'Post_Key';
}

export interface PublicDataData {
  neighborhoods: ({
    name: string;
    city: string;
    zipCode: string;
  })[];
}

export interface SeedAndManageDataData {
  user_insert: User_Key;
  post_insert: Post_Key;
  post_update?: Post_Key | null;
  item_delete?: Item_Key | null;
  message_insert: Message_Key;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

interface SeedAndManageDataRef {
  /* Allow users to create refs without passing in DataConnect */
  (): MutationRef<SeedAndManageDataData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): MutationRef<SeedAndManageDataData, undefined>;
  operationName: string;
}
export const seedAndManageDataRef: SeedAndManageDataRef;

export function seedAndManageData(): MutationPromise<SeedAndManageDataData, undefined>;
export function seedAndManageData(dc: DataConnect): MutationPromise<SeedAndManageDataData, undefined>;

interface GetOperationsRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetOperationsData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<GetOperationsData, undefined>;
  operationName: string;
}
export const getOperationsRef: GetOperationsRef;

export function getOperations(options?: ExecuteQueryOptions): QueryPromise<GetOperationsData, undefined>;
export function getOperations(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetOperationsData, undefined>;

interface PublicDataRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<PublicDataData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<PublicDataData, undefined>;
  operationName: string;
}
export const publicDataRef: PublicDataRef;

export function publicData(options?: ExecuteQueryOptions): QueryPromise<PublicDataData, undefined>;
export function publicData(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<PublicDataData, undefined>;

