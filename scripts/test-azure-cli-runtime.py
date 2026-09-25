import importlib
import os
import ssl
import sys
from unittest.mock import Mock, patch


def deny_network(event, _args):
    if event in ("socket.connect", "socket.getaddrinfo"):
        raise AssertionError("Network access is forbidden in the runtime build check")


sys.addaudithook(deny_network)
if not os.environ.get("AZURE_CONFIG_DIR"):
    raise AssertionError("An isolated CLI config directory is required")

import certifi
from azure.cli.core import get_default_cli
from azure.cli.core._profile import Profile, SubscriptionFinder
from azure.cli.core.auth.identity import Identity

ssl.create_default_context(cafile=certifi.where())
for module in (
    "msal",
    "msal_extensions",
    "cryptography",
    "azure.cli.core.auth.persistence",
    "azure.cli.core.auth.msal_credentials",
    "azure.cli.command_modules.profile.custom",
):
    importlib.import_module(module)

tenant = "11111111-1111-4111-8111-111111111111"
username = "runtime-check@example.test"
scopes = ["499b84ac-1321-427f-aa17-267ca6975798/.default"]
result = {
    "access_token": "synthetic-build-token",
    "expires_in": 3600,
    "id_token_claims": {"preferred_username": username, "tid": tenant, "oid": tenant},
}
application = Mock()
application.acquire_token_interactive.return_value = result
application.acquire_token_silent_with_error.return_value = result
application.get_accounts.return_value = [{"username": username, "home_account_id": tenant}]

with (
    patch("webbrowser.open", side_effect=AssertionError("No real browser allowed")),
    patch("azure.cli.core.auth.identity.PublicClientApplication", return_value=application),
    patch("azure.cli.core.auth.msal_credentials.PublicClientApplication", return_value=application),
):
    identity = Identity("https://login.microsoftonline.com", tenant_id=tenant,
                        enable_broker_on_windows=False, encrypt=True)
    account = identity.login_with_auth_code(scopes)
    assert account["username"] == username
    assert application.acquire_token_interactive.call_args.kwargs["prompt"] == "select_account"
    assert application.acquire_token_interactive.call_args.kwargs["success_template"]
    credential = identity.get_user_credential(username)
    assert credential.acquire_token(scopes)["access_token"] == "synthetic-build-token"
    assert credential.acquire_token(scopes)["expires_in"] == 3600

    cli = get_default_cli()
    profile = Profile(cli_ctx=cli, storage={"subscriptions": []})
    subscription = profile._new_account()
    assert subscription.state == "Enabled"
    client = SubscriptionFinder(cli)._create_subscription_client(credential)
    assert client.subscriptions is not None
    client.close()
    with (
        patch("azure.cli.core._profile._create_identity_instance", return_value=identity),
        patch("azure.cli.core._profile.can_launch_browser", return_value=True),
        patch("azure.cli.core._profile.is_github_codespaces", return_value=False),
        patch.object(SubscriptionFinder, "find_using_specific_tenant", return_value=[subscription]),
    ):
        subscription.id = "/subscriptions/" + tenant
        subscription.display_name = "Synthetic build subscription"
        subscription.tenant_id = tenant
        accounts = profile.login(True, None, None, False, tenant, allow_no_subscriptions=True)
        assert accounts[0]["tenantId"] == tenant
        token, _, token_tenant = profile.get_raw_token(scopes=scopes, tenant=tenant)
        assert token_tenant == tenant
        assert token[2]["accessToken"] == "synthetic-build-token"
        application.acquire_token_interactive.side_effect = KeyboardInterrupt
        try:
            identity.login_with_auth_code(scopes)
        except KeyboardInterrupt:
            pass
        else:
            raise AssertionError("Cancellation must propagate")

print("Offline CLI runtime checks passed: TLS, browser templates, profile, tenant token and cancellation.")
