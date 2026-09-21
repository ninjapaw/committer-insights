# ADR 0001: Linked dedicated Azure Functions app instead of SWA managed Functions

## Status

Accepted

## Context

Azure Static Web Apps supports a "managed Functions" integration where the
Functions app is created and operated implicitly by the SWA resource. This
portal requires:

- OAuth On-Behalf-Of token exchange with a confidential client credential
  resolved from Key Vault via managed identity.
- Full control over Node.js version, memory/instance scaling, and outbound
  networking to `https://advsec.dev.azure.com`.
- Independent diagnostic settings, Application Insights sampling, and
  system-assigned identity role assignments to Key Vault.

Managed Functions integrations impose additional constraints on runtime
configuration, identity, and networking that would complicate or block the
OBO flow and Key Vault-backed credential management.

## Decision

Use a **linked, dedicated Azure Functions app** (`Microsoft.Web/sites`, Flex
Consumption plan, Node 22) connected to the Static Web App via
`Microsoft.Web/staticSites/linkedBackends`. The frontend remains hosted on
Azure Static Web Apps.

## Consequences

- One additional resource (Function App + its storage account) to operate
  and monitor per environment.
- Full control over app settings, Key Vault references, and managed
  identity role assignments.
- Slightly higher infrastructure complexity than a fully managed SWA
  Functions integration, offset by correctness and security requirements.
