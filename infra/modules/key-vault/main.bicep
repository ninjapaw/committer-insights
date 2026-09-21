metadata description = 'RBAC-authorised Key Vault with audit logging, vendored from pawprint/modules/key-vault for the committer-insights confidential client credential and other secrets.'

targetScope = 'resourceGroup'

@description('Globally unique Key Vault name.')
@minLength(3)
@maxLength(24)
param keyVaultName string

@description('Azure region for the Key Vault.')
param location string = resourceGroup().location

@description('Environment name, for example dev or prod.')
param environmentName string = 'dev'

@description('Application identifier recorded in tags.')
param application string

@description('Key Vault SKU.')
@allowed([
  'standard'
  'premium'
])
param skuName string = 'standard'

@description('Days a soft-deleted secret remains recoverable.')
@minValue(7)
@maxValue(90)
param softDeleteRetentionInDays int = 90

@description('Enable purge protection.')
param enablePurgeProtection bool = true

@description('Allow public network access.')
param allowPublicNetworkAccess bool = true

@description('Principal IDs granted Key Vault Secrets User, typically the API managed identity.')
param secretsUserPrincipalIds string[] = []

@description('Principal IDs granted Key Vault Secrets Officer, the rotation role.')
param secretsOfficerPrincipalIds string[] = []

@description('Log Analytics workspace resource ID that receives audit logs.')
param logAnalyticsWorkspaceId string = ''

@description('Additional tags merged over the organisation baseline.')
param tags object = {}

var resourceTags = union({
  application: application
  component: 'keyvault'
  environment: environmentName
  owner: 'ninjapaw'
  managedBy: 'bicep'
}, tags)

var secretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var secretsOfficerRoleId = 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'

resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' = {
  name: keyVaultName
  location: location
  tags: resourceTags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: skuName
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: softDeleteRetentionInDays
    enablePurgeProtection: enablePurgeProtection ? true : null
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: false
    publicNetworkAccess: allowPublicNetworkAccess ? 'Enabled' : 'Disabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: allowPublicNetworkAccess ? 'Allow' : 'Deny'
      ipRules: []
      virtualNetworkRules: []
    }
  }
}

resource secretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in secretsUserPrincipalIds: {
    name: guid(keyVault.id, principalId, secretsUserRoleId)
    scope: keyVault
    properties: {
      principalId: principalId
      principalType: 'ServicePrincipal'
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', secretsUserRoleId)
    }
  }
]

resource secretsOfficer 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in secretsOfficerPrincipalIds: {
    name: guid(keyVault.id, principalId, secretsOfficerRoleId)
    scope: keyVault
    properties: {
      principalId: principalId
      principalType: 'ServicePrincipal'
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', secretsOfficerRoleId)
    }
  }
]

#disable-next-line use-recent-api-versions
resource auditLogs 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (!empty(logAnalyticsWorkspaceId)) {
  name: '${keyVaultName}-audit'
  scope: keyVault
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      { category: 'AuditEvent', enabled: true }
      { category: 'AzurePolicyEvaluationDetails', enabled: true }
    ]
    metrics: []
  }
}

output resourceId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
