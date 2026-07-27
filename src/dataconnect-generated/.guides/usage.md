# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { seedAndManageData, getOperations, publicData } from '@dataconnect/generated';


// Operation SeedAndManageData: 
const { data } = await SeedAndManageData(dataConnect);

// Operation GetOperations: 
const { data } = await GetOperations(dataConnect);

// Operation PublicData: 
const { data } = await PublicData(dataConnect);


```