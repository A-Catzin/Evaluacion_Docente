const { queryRef, executeQuery, validateArgsWithOptions, mutationRef, executeMutation, validateArgs, makeMemoryCacheProvider } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'evaluaci-ndocente',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;
const dataConnectSettings = {
  cacheSettings: {
    cacheProvider: makeMemoryCacheProvider()
  }
};
exports.dataConnectSettings = dataConnectSettings;

const seedAndManageDataRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'SeedAndManageData');
}
seedAndManageDataRef.operationName = 'SeedAndManageData';
exports.seedAndManageDataRef = seedAndManageDataRef;

exports.seedAndManageData = function seedAndManageData(dc) {
  const { dc: dcInstance, vars: inputVars } = validateArgs(connectorConfig, dc, undefined);
  return executeMutation(seedAndManageDataRef(dcInstance, inputVars));
}
;

const getOperationsRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetOperations');
}
getOperationsRef.operationName = 'GetOperations';
exports.getOperationsRef = getOperationsRef;

exports.getOperations = function getOperations(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(getOperationsRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;

const publicDataRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'PublicData');
}
publicDataRef.operationName = 'PublicData';
exports.publicDataRef = publicDataRef;

exports.publicData = function publicData(dcOrOptions, options) {
  
  const { dc: dcInstance, vars: inputVars, options: inputOpts } = validateArgsWithOptions(connectorConfig, dcOrOptions, options, undefined,false, false);
  return executeQuery(publicDataRef(dcInstance, inputVars), inputOpts && { fetchPolicy: inputOpts.fetchPolicy });
}
;
