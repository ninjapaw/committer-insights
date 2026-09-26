/* Native Mach-O launcher compiled into Developer Usage Insights.app.
 *
 * The bundle ships its own Node.js, GitHub CLI, and Azure CLI under
 * Contents/Resources. This stub resolves those paths relative to its own
 * location and starts the local report server, choosing between two modes:
 *
 *   - No arguments and no controlling terminal (Finder double-click, `open`,
 *     Launch Services): hand a generated shell script to Terminal.app so the
 *     server runs in a visible window the user can read and close. See
 *     run_in_visible_terminal.
 *   - Anything else (arguments supplied, or a controlling terminal is present):
 *     exec Node in place so stdio and arguments behave normally. Checking the
 *     arguments matters because a CLI invocation such as `--help` is often made
 *     with stdin redirected, which would otherwise look like a Finder launch.
 *
 * Info.plist sets LSUIElement=true because this stub never links AppKit and
 * opens no native window; without it the Dock icon bounces indefinitely
 * waiting for a window-server handshake that never arrives. */

#include <libgen.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
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

/* Writes value into stream as a double-quoted POSIX shell string, escaping
 * characters that would otherwise be interpreted by the shell. */
static void write_shell_quoted(FILE *stream, const char *value) {
    fputc('"', stream);
    for (const char *cursor = value; *cursor; cursor++) {
        if (*cursor == '"' || *cursor == '\\' || *cursor == '$' || *cursor == '`') {
            fputc('\\', stream);
        }
        fputc(*cursor, stream);
    }
    fputc('"', stream);
}

/* Launched from Finder/Launch Services there is no controlling terminal, so we
 * write a small shell script that sets up the bundled runtime and hand it to
 * Terminal.app. This makes the running server visible in its own window, and
 * closing that window (which ends the foreground process group) quits the
 * server along with it. */
static int run_in_visible_terminal(const char *node, const char *script, const char *gh,
                                    const char *azure_cli_home) {
    char command_path[] = "/tmp/developer-usage-insights-launch.XXXXXX.command";
    int suffix_length = (int)strlen(".command");
    int fd = mkstemps(command_path, suffix_length);
    if (fd < 0) {
        perror("Unable to create the macOS launch script");
        return 1;
    }
    FILE *stream = fdopen(fd, "w");
    if (!stream) {
        perror("Unable to open the macOS launch script");
        close(fd);
        return 1;
    }
    fputs("#!/bin/sh\n", stream);
    fputs("export DEVELOPER_USAGE_INSIGHTS_GH_PATH=", stream);
    write_shell_quoted(stream, gh);
    fputc('\n', stream);
    fputs("export DEVELOPER_USAGE_INSIGHTS_AZ_HOME=", stream);
    write_shell_quoted(stream, azure_cli_home);
    fputc('\n', stream);
    fputs("export DEVELOPER_USAGE_INSIGHTS_BUNDLED_NODE=true\n", stream);
    write_shell_quoted(stream, node);
    fputc(' ', stream);
    write_shell_quoted(stream, script);
    fputc('\n', stream);
    fputs("rm -f \"$0\"\n", stream);
    if (fclose(stream) != 0) {
        perror("Unable to write the macOS launch script");
        return 1;
    }
    if (chmod(command_path, 0755) != 0) {
        perror("Unable to make the macOS launch script executable");
        return 1;
    }
    execl("/usr/bin/open", "open", "-a", "Terminal", command_path, (char *)NULL);
    perror("Unable to open Terminal for the bundled application");
    return 1;
}

/* Counts the arguments that indicate deliberate command-line use. Launch
 * Services starts bundles with no arguments; older macOS releases appended a
 * -psn_<serial> flag, which is not a user argument and is ignored here. */
static int cli_argument_count(int argc, char **argv) {
    int count = 0;
    for (int index = 1; index < argc; index++) {
        if (strncmp(argv[index], "-psn_", 5) == 0) continue;
        count++;
    }
    return count;
}

int main(int argc, char **argv) {
    char resources[PATH_MAX];
    char node[PATH_MAX];
    char script[PATH_MAX];
    char gh[PATH_MAX];
    char azure_cli_home[PATH_MAX];

    resource_path(resources, sizeof(resources), argv[0]);
    if (snprintf(node, sizeof(node), "%s/node", resources) >= (int)sizeof(node) ||
        snprintf(script, sizeof(script), "%s/developer-usage-insights.cjs", resources) >= (int)sizeof(script) ||
        snprintf(gh, sizeof(gh), "%s/gh", resources) >= (int)sizeof(gh) ||
        snprintf(azure_cli_home, sizeof(azure_cli_home), "%s/azure-cli", resources) >= (int)sizeof(azure_cli_home)) {
        fprintf(stderr, "The macOS application resource path is too long.\n");
        return 1;
    }

    if (cli_argument_count(argc, argv) == 0 && !isatty(STDIN_FILENO)) {
        return run_in_visible_terminal(node, script, gh, azure_cli_home);
    }

    /* Deliberate command-line use (arguments supplied, or a controlling
     * terminal is attached): exec Node in place, forwarding args and stdio. */
    setenv("DEVELOPER_USAGE_INSIGHTS_GH_PATH", gh, 1);
    setenv("DEVELOPER_USAGE_INSIGHTS_AZ_HOME", azure_cli_home, 1);
    setenv("DEVELOPER_USAGE_INSIGHTS_BUNDLED_NODE", "true", 1);
    char **child_argv = calloc((size_t)argc + 2, sizeof(char *));
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
