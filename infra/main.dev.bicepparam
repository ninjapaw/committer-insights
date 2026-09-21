using './main.bicep'

param siteName = 'np-committer-insights-dev-centralus'
param functionAppName = 'np-committer-insights-api-dev-centralus'
param keyVaultName = 'np-committer-dev-kv'
param logAnalyticsName = 'log-committer-insights-dev-centralus'
param applicationInsightsName = 'appi-committer-insights-dev-centralus'
param location = 'centralus'
param environmentName = 'dev'
param entraClientId = 'REPLACE_WITH_DEV_ENTRA_CLIENT_ID'
param entraExpectedAudience = 'api://REPLACE_WITH_DEV_ENTRA_CLIENT_ID'
param deploymentPrincipalId = 'REPLACE_WITH_DEPLOYMENT_PRINCIPAL_OBJECT_ID'
param featureGitHubProvider = false
