metadata description = 'Log Analytics workspace and Application Insights, linked. Vendored from pawprint/modules/monitoring; cost bounded by a daily ingestion cap.'

@description('Azure region.')
param location string = resourceGroup().location

@description('Log Analytics workspace name.')
param workspaceName string

@description('Application Insights component name.')
param applicationInsightsName string

@description('Tags applied to every resource in this module.')
param tags object = {}

@description('Retention in days.')
@minValue(30)
@maxValue(730)
param retentionInDays int = 30

@description('Daily ingestion cap in GB.')
param dailyQuotaGb int = 1

@description('Telemetry sampling percentage.')
@minValue(1)
@maxValue(100)
param samplingPercentage int = 100

var moduleTags = union(tags, { component: 'monitoring' })

resource workspace 'Microsoft.OperationalInsights/workspaces@2025-02-01' = {
  name: workspaceName
  location: location
  tags: moduleTags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: retentionInDays
    workspaceCapping: { dailyQuotaGb: dailyQuotaGb }
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource applicationInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: applicationInsightsName
  location: location
  tags: moduleTags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
    IngestionMode: 'LogAnalytics'
    SamplingPercentage: samplingPercentage
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

output workspaceId string = workspace.id
output workspaceCustomerId string = workspace.properties.customerId
output applicationInsightsId string = applicationInsights.id
output applicationInsightsConnectionString string = applicationInsights.properties.ConnectionString
