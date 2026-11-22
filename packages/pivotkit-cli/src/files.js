/*
 * pivotkit-cli/files: the command line's file handling for pivotkit's other Node front ends. It lives
 * in pivotkit-node/files, which the command line and pivotkit-server share; this entry keeps its
 * names where they were published.
 */

export { CliError, DATA_FORMATS, INFO_NOTES, TEMP_FILE_NAME, allowedDirs, asCliError, cleanFileName, isInside, printable, readSafe, readStdin, readTable, shortName, writeNew, writeSafe } from "pivotkit-node/files";
