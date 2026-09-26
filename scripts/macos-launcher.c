#include <libgen.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

static void resource_path(char *output, size_t length, const char *argv0) {
    char executable[PATH_MAX];
    char *directory;
    if (!realpath(argv0, executable)) {
        fprintf(stderr, "Unable to resolve the macOS application launcher.\n");
        exit(1);
    }
    directory = dirname(executable);
    if (snprintf(output, length, "%s/../Resources", directory) >= (int)length) {
        fprintf(stderr, "The macOS application resource path is too long.\n");
        exit(1);
    }
}

int main(int argc, char **argv) {
    char resources[PATH_MAX];
    char node[PATH_MAX];
    char script[PATH_MAX];
    char **child_argv;

    resource_path(resources, sizeof(resources), argv[0]);
    if (snprintf(node, sizeof(node), "%s/node", resources) >= (int)sizeof(node) ||
        snprintf(script, sizeof(script), "%s/developer-usage-insights.cjs", resources) >= (int)sizeof(script)) {
        fprintf(stderr, "The macOS application resource path is too long.\n");
        return 1;
    }
    {
        char gh[PATH_MAX];
        if (snprintf(gh, sizeof(gh), "%s/gh", resources) >= (int)sizeof(gh)) return 1;
        setenv("DEVELOPER_USAGE_INSIGHTS_GH_PATH", gh, 1);
    }
    {
        char azure_cli_home[PATH_MAX];
        if (snprintf(azure_cli_home, sizeof(azure_cli_home), "%s/azure-cli", resources) >= (int)sizeof(azure_cli_home))
            return 1;
        setenv("DEVELOPER_USAGE_INSIGHTS_AZ_HOME", azure_cli_home, 1);
    }
    setenv("DEVELOPER_USAGE_INSIGHTS_BUNDLED_NODE", "true", 1);
    child_argv = calloc((size_t)argc + 2, sizeof(char *));
    if (!child_argv) return 1;
    child_argv[0] = node;
    child_argv[1] = script;
    for (int index = 1; index < argc; index++) child_argv[index + 1] = argv[index];
    child_argv[argc + 1] = NULL;
    execv(node, child_argv);
    perror("Unable to start the bundled Node.js runtime");
    free(child_argv);
    return 1;
}
