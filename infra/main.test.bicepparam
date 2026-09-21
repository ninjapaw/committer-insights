using './main.bicep'

param siteName = 'np-committer-insights-test-centralus'
param functionAppName = 'np-committer-insights-api-test-centralus'
param keyVaultName = 'np-committer-test-kv'
param logAnalyticsName = 'log-committer-insights-test-centralus'
param applicationInsightsName = 'appi-committer-insights-test-centralus'
param location = 'centralus'
param environmentName = 'test'
param entraClientId = 'REPLACE_WITH_TEST_ENTRA_CLIENT_ID'
param entraTenantAuthority = 'https://login.microsoftonline.com/organizations'
param entraExpectedAudience = 'api://REPLACE_WITH_TEST_ENTRA_CLIENT_ID'
param deploymentPrincipalId = 'REPLACE_WITH_DEPLOYMENT_PRINCIPAL_OBJECT_ID'
param featureGitHubProvider = false
