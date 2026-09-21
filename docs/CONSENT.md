# Consent explanation (customer-facing)

This is the exact text shown on the in-product consent explanation page,
provided here for legal and security review.

## Connect Azure DevOps

To build your report, Active Committer Portal needs delegated access to
Azure DevOps on your behalf.

### What the portal requests

- Read-only access required for Azure DevOps Advanced Security reporting
- Access is limited by your existing Azure DevOps permissions
- Your organization may require administrator approval

### What the portal does not request

- No permission to modify repositories
- No permission to change pipelines
- No permission to change organization settings
- No customer PAT
- No permission to write source code

### How data is handled

- Azure DevOps tokens remain server-side
- Report retention defaults to no saved history
- Exports are generated only at your request
- You can disconnect the integration and delete retained reports

### Confirmation

Checkbox: "I understand the access being requested and want to continue."

Button: "Continue to Microsoft" (disabled until the checkbox is selected).
