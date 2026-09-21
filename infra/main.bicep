metadata description = 'Active Committer Portal: Static Web App + linked Azure Functions API, Key Vault, and monitoring.'

targetScope = 'resourceGroup'

@description('Globally unique Static Web App name.')
param siteName string

@description('Function App name.')
param functionAppName string

@description('Key Vault name for the Entra confidential client credential.')
param keyVaultName string

@description('Log Analytics workspace name.')
param logAnalyticsName string

@description('Application Insights name.')
param applicationInsightsName string

@description('Azure region.')
param location string = resourceGroup().location

@description('Deployment environment.')
@allowed(['dev', 'test', 'prod'])
param environmentName string

@description('Microsoft Entra application (client) ID for this API.')
param entraClientId string

@description('Microsoft Entra tenant authority, e.g. https://login.microsoftonline.com/organizations.')
param entraTenantAuthority string

@description('Expected audience for incoming bearer tokens.')
param entraExpectedAudience string

@description('Object ID of the OIDC identity used for Function code publication.')
param deploymentPrincipalId string

@description('Enable the feature-flagged GitHub provider.')
param featureGitHubProvider bool = false

module monitoring './modules/monitoring/main.bicep' = {
  name: 'committer-insights-monitoring'
  params: {
    location: location
    workspaceName: logAnalyticsName
    applicationInsightsName: applicationInsightsName
    tags: { application: 'committer-insights', environment: environmentName }
  }
}

module api './modules/function-app/main.bicep' = {
  name: 'committer-insights-api'
  params: {
    functionAppName: functionAppName
    location: location
    environmentName: environmentName
    keyVaultName: keyVaultName
    entraClientId: entraClientId
    entraTenantAuthority: entraTenantAuthority
    entraExpectedAudience: entraExpectedAudience
    featureGitHubProvider: featureGitHubProvider
    deploymentPrincipalId: deploymentPrincipalId
    applicationInsightsConnectionString: monitoring.outputs.applicationInsightsConnectionString
    logAnalyticsWorkspaceId: monitoring.outputs.workspaceId
  }
}

module keyVault './modules/key-vault/main.bicep' = {
  name: 'committer-insights-keyvault'
  params: {
    keyVaultName: keyVaultName
    location: location
    environmentName: environmentName
    application: 'committer-insights'
    enablePurgeProtection: true
    secretsUserPrincipalIds: [api.outputs.managedIdentityPrincipalId]
    logAnalyticsWorkspaceId: monitoring.outputs.workspaceId
  }
}

module web './modules/static-site/main.bicep' = {
  name: 'committer-insights-web'
  params: {
    siteName: siteName
    location: location
    environmentName: environmentName
    application: 'committer-insights'
    siteSkuName: 'Standard'
  }
}

resource staticSite 'Microsoft.Web/staticSites@2025-03-01' existing = {
  name: siteName
}

resource linkedBackend 'Microsoft.Web/staticSites/linkedBackends@2025-03-01' = {
  parent: staticSite
  name: environmentName
  properties: {
    backendResourceId: api.outputs.functionAppId
    region: location
  }
  dependsOn: [web]
}

output webUrl string = web.outputs.defaultUrl
output apiHostname string = api.outputs.defaultHostname
output keyVaultUri string = keyVault.outputs.keyVaultUri
