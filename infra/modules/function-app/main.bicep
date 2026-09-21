metadata description = 'Azure Functions backend (Flex Consumption, Node 22) for the Active Committer Portal API, performing bearer validation and OBO exchange for Azure DevOps. Adapted from pawprint/infra/portal/api.bicep.'

targetScope = 'resourceGroup'

@description('Globally unique Function App name.')
param functionAppName string

@description('Azure region for the Function App resources.')
param location string = resourceGroup().location

@description('Deployment environment.')
param environmentName string = 'dev'

@description('Key Vault name holding the Entra confidential client credential.')
param keyVaultName string

@description('Microsoft Entra application (client) ID for this API.')
param entraClientId string

@description('Microsoft Entra tenant authority, e.g. https://login.microsoftonline.com/organizations.')
param entraTenantAuthority string

@description('Expected audience for incoming bearer tokens (api://<client-id>).')
param entraExpectedAudience string

@description('Azure DevOps API version, isolated to one configuration point.')
param azureDevOpsApiVersion string = '7.2-preview.3'

@description('Default report retention.')
@allowed([
  'none'
  'session'
  'thirty-days'
])
param reportRetentionDefault string = 'none'

@description('Enable the feature-flagged, disabled-by-default GitHub provider.')
param featureGitHubProvider bool = false

@description('Existing Application Insights connection string.')
@secure()
param applicationInsightsConnectionString string

@description('Existing Log Analytics workspace resource ID.')
param logAnalyticsWorkspaceId string

@description('Object ID of the OIDC identity used only for Function code publication.')
param deploymentPrincipalId string

var tags = {
  application: 'committer-insights-api'
  component: 'api'
  environment: environmentName
  managedBy: 'bicep'
  owner: 'ninjapaw'
}
var storageAccountName = take('st${uniqueString(resourceGroup().id, functionAppName)}', 24)
var deploymentContainerName = 'function-releases'

resource storageAccount 'Microsoft.Storage/storageAccounts@2025-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    minimumTlsVersion: 'TLS1_2'
    publicNetworkAccess: 'Enabled'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2025-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2025-01-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: { publicAccess: 'None' }
}

resource flexPlan 'Microsoft.Web/serverfarms@2025-03-01' = {
  name: '${functionAppName}-plan'
  location: location
  tags: tags
  kind: 'functionapp'
  sku: { name: 'FC1', tier: 'FlexConsumption' }
  properties: { reserved: true }
}

resource functionApp 'Microsoft.Web/sites@2025-03-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    clientAffinityEnabled: false
    httpsOnly: true
    publicNetworkAccess: 'Enabled'
    serverFarmId: flexPlan.id
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: '${storageAccount.properties.primaryEndpoints.blob}${deploymentContainer.name}'
          authentication: { type: 'SystemAssignedIdentity' }
        }
      }
      runtime: { name: 'node', version: '22' }
      scaleAndConcurrency: {
        instanceMemoryMB: 512
        maximumInstanceCount: 40
        alwaysReady: []
      }
    }
    siteConfig: {
      appSettings: [
        { name: 'AzureWebJobsStorage__accountName', value: storageAccount.name }
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: applicationInsightsConnectionString }
        { name: 'API_ENTRA_CLIENT_ID', value: entraClientId }
        { name: 'API_ENTRA_TENANT_AUTHORITY', value: entraTenantAuthority }
        { name: 'API_EXPECTED_AUDIENCE', value: entraExpectedAudience }
        {
          name: 'API_ENTRA_CLIENT_SECRET'
          value: '@Microsoft.KeyVault(VaultName=${keyVaultName};SecretName=api-entra-client-secret)'
        }
        { name: 'AZURE_DEVOPS_RESOURCE', value: 'https://app.vssps.visualstudio.com' }
        { name: 'AZURE_DEVOPS_API_VERSION', value: azureDevOpsApiVersion }
        { name: 'REPORT_RETENTION_DEFAULT', value: reportRetentionDefault }
        { name: 'ENABLE_MOCK_DATA', value: 'false' }
        { name: 'FEATURE_GITHUB_PROVIDER', value: string(featureGitHubProvider) }
      ]
    }
  }
}

var storageBlobDataOwnerRoleId = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var storageQueueDataContributorRoleId = '974c5e8b-45b9-4653-ba55-5f855dd0fb88'

resource storageBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(functionApp.id, storageAccount.id, storageBlobDataOwnerRoleId)
  scope: storageAccount
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRoleId)
  }
}

resource storageQueueRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(functionApp.id, storageAccount.id, storageQueueDataContributorRoleId)
  scope: storageAccount
  properties: {
    principalId: functionApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageQueueDataContributorRoleId)
  }
}

resource deploymentBlobRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(deploymentPrincipalId)) {
  name: guid(functionApp.id, storageAccount.id, deploymentPrincipalId, storageBlobDataOwnerRoleId)
  scope: storageAccount
  properties: {
    principalId: deploymentPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataOwnerRoleId)
  }
}

#disable-next-line use-recent-api-versions
resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: '${functionAppName}-diagnostics'
  scope: functionApp
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'FunctionAppLogs', enabled: true }
    ]
    metrics: [
      { category: 'AllMetrics', enabled: true }
    ]
  }
}

output functionAppId string = functionApp.id
output functionAppName string = functionApp.name
output managedIdentityPrincipalId string = functionApp.identity.principalId
output defaultHostname string = functionApp.properties.defaultHostName
