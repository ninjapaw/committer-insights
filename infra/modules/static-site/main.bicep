metadata description = 'Azure Static Web App with an optional DNS-validated custom domain. Wraps the Azure Verified Module so every site in the organisation gets the same TLS, staging and tagging posture without each repository restating it.'

targetScope = 'resourceGroup'

@description('Globally unique Static Web App name.')
@minLength(2)
@maxLength(40)
param siteName string

@description('Azure region for the Static Web App resource metadata. Static Web Apps serve from a global edge regardless of this value.')
param location string = resourceGroup().location

@description('Environment name, for example dev or prod.')
param environmentName string = 'dev'

@description('Application identifier recorded in tags, for example committer-insights.')
param application string

@description('Static Web Apps plan. Standard is required for the linked authenticated Functions backend.')
@allowed([
  'Free'
  'Standard'
])
param siteSkuName string = 'Standard'

@description('Whether pull request builds get their own staging environment.')
@allowed([
  'Enabled'
  'Disabled'
])
param stagingEnvironmentPolicy string = 'Enabled'

@description('Additional tags merged over the organisation baseline.')
param tags object = {}

var resourceTags = union({
  application: application
  component: 'web'
  environment: environmentName
  owner: 'ninjapaw'
  managedBy: 'bicep'
  'azd-service-name': 'web'
}, tags)

module staticSite 'br/public:avm/res/web/static-site:0.9.5' = {
  name: 'static-site-${uniqueString(resourceGroup().id, siteName)}'
  params: {
    name: siteName
    location: location
    allowConfigFileUpdates: true
    enableTelemetry: false
    sku: siteSkuName
    stagingEnvironmentPolicy: stagingEnvironmentPolicy
    tags: resourceTags
  }
}

output resourceId string = staticSite.outputs.resourceId
output defaultHostname string = staticSite.outputs.defaultHostname
output defaultUrl string = 'https://${staticSite.outputs.defaultHostname}'
