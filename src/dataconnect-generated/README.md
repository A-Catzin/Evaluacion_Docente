# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetOperations*](#getoperations)
  - [*PublicData*](#publicdata)
- [**Mutations**](#mutations)
  - [*SeedAndManageData*](#seedandmanagedata)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetOperations
You can execute the `GetOperations` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getOperations(options?: ExecuteQueryOptions): QueryPromise<GetOperationsData, undefined>;

interface GetOperationsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<GetOperationsData, undefined>;
}
export const getOperationsRef: GetOperationsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getOperations(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<GetOperationsData, undefined>;

interface GetOperationsRef {
  ...
  (dc: DataConnect): QueryRef<GetOperationsData, undefined>;
}
export const getOperationsRef: GetOperationsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getOperationsRef:
```typescript
const name = getOperationsRef.operationName;
console.log(name);
```

### Variables
The `GetOperations` query has no variables.
### Return Type
Recall that executing the `GetOperations` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetOperationsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetOperations`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getOperations } from '@dataconnect/generated';


// Call the `getOperations()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getOperations();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getOperations(dataConnect);

console.log(data.user);
console.log(data.posts);
console.log(data.items);
console.log(data.messages);

// Or, you can use the `Promise` API.
getOperations().then((response) => {
  const data = response.data;
  console.log(data.user);
  console.log(data.posts);
  console.log(data.items);
  console.log(data.messages);
});
```

### Using `GetOperations`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getOperationsRef } from '@dataconnect/generated';


// Call the `getOperationsRef()` function to get a reference to the query.
const ref = getOperationsRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getOperationsRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.user);
console.log(data.posts);
console.log(data.items);
console.log(data.messages);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.user);
  console.log(data.posts);
  console.log(data.items);
  console.log(data.messages);
});
```

## PublicData
You can execute the `PublicData` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
publicData(options?: ExecuteQueryOptions): QueryPromise<PublicDataData, undefined>;

interface PublicDataRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<PublicDataData, undefined>;
}
export const publicDataRef: PublicDataRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
publicData(dc: DataConnect, options?: ExecuteQueryOptions): QueryPromise<PublicDataData, undefined>;

interface PublicDataRef {
  ...
  (dc: DataConnect): QueryRef<PublicDataData, undefined>;
}
export const publicDataRef: PublicDataRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the publicDataRef:
```typescript
const name = publicDataRef.operationName;
console.log(name);
```

### Variables
The `PublicData` query has no variables.
### Return Type
Recall that executing the `PublicData` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `PublicDataData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface PublicDataData {
  neighborhoods: ({
    name: string;
    city: string;
    zipCode: string;
  })[];
}
```
### Using `PublicData`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, publicData } from '@dataconnect/generated';


// Call the `publicData()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await publicData();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await publicData(dataConnect);

console.log(data.neighborhoods);

// Or, you can use the `Promise` API.
publicData().then((response) => {
  const data = response.data;
  console.log(data.neighborhoods);
});
```

### Using `PublicData`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, publicDataRef } from '@dataconnect/generated';


// Call the `publicDataRef()` function to get a reference to the query.
const ref = publicDataRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = publicDataRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.neighborhoods);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.neighborhoods);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## SeedAndManageData
You can execute the `SeedAndManageData` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
seedAndManageData(): MutationPromise<SeedAndManageDataData, undefined>;

interface SeedAndManageDataRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): MutationRef<SeedAndManageDataData, undefined>;
}
export const seedAndManageDataRef: SeedAndManageDataRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
seedAndManageData(dc: DataConnect): MutationPromise<SeedAndManageDataData, undefined>;

interface SeedAndManageDataRef {
  ...
  (dc: DataConnect): MutationRef<SeedAndManageDataData, undefined>;
}
export const seedAndManageDataRef: SeedAndManageDataRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the seedAndManageDataRef:
```typescript
const name = seedAndManageDataRef.operationName;
console.log(name);
```

### Variables
The `SeedAndManageData` mutation has no variables.
### Return Type
Recall that executing the `SeedAndManageData` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `SeedAndManageDataData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface SeedAndManageDataData {
  user_insert: User_Key;
  post_insert: Post_Key;
  post_update?: Post_Key | null;
  item_delete?: Item_Key | null;
  message_insert: Message_Key;
}
```
### Using `SeedAndManageData`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, seedAndManageData } from '@dataconnect/generated';


// Call the `seedAndManageData()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await seedAndManageData();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await seedAndManageData(dataConnect);

console.log(data.user_insert);
console.log(data.post_insert);
console.log(data.post_update);
console.log(data.item_delete);
console.log(data.message_insert);

// Or, you can use the `Promise` API.
seedAndManageData().then((response) => {
  const data = response.data;
  console.log(data.user_insert);
  console.log(data.post_insert);
  console.log(data.post_update);
  console.log(data.item_delete);
  console.log(data.message_insert);
});
```

### Using `SeedAndManageData`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, seedAndManageDataRef } from '@dataconnect/generated';


// Call the `seedAndManageDataRef()` function to get a reference to the mutation.
const ref = seedAndManageDataRef();

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = seedAndManageDataRef(dataConnect);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.user_insert);
console.log(data.post_insert);
console.log(data.post_update);
console.log(data.item_delete);
console.log(data.message_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.user_insert);
  console.log(data.post_insert);
  console.log(data.post_update);
  console.log(data.item_delete);
  console.log(data.message_insert);
});
```

