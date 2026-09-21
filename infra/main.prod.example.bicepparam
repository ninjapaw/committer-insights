using './main.bicep'

// Example only. Copy to main.prod.bicepparam and fill in real values;
// do not commit the filled-in production parameter file.
param siteName = 'np-committer-insights-prod-centralus'
param functionAppName = 'np-committer-insights-api-prod-centralus'
param keyVaultName = 'np-committer-prod-kv'
param logAnalyticsName = 'log-committer-insights-prod-centralus'
param applicationInsightsName = 'appi-committer-insights-prod-centralus'
param location = 'centralus'
param environmentName = 'prod'
param entraClientId = 'REPLACE_WITH_PROD_ENTRA_CLIENT_ID'
param entraExpectedAudience = 'api://REPLACE_WITH_PROD_ENTRA_CLIENT_ID'
param deploymentPrincipalId = 'REPLACE_WITH_DEPLOYMENT_PRINCIPAL_OBJECT_ID'
param featureGitHubProvider = false
