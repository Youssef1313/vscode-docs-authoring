import { QuickPickItem, QuickPickOptions, Range, Selection, TextDocument, TextDocumentChangeEvent, TextEditor, window, workspace } from "vscode";
import * as common from "./common";
import { getLanguageIdentifierQuickPickItems, IHighlightLanguage, languages } from "./highlight-langs";
import * as log from "./log";
import { isMarkdownFileCheck } from "./common";

/**
 * Checks the user input for table creation.
 * Format - C:R.
 * Columns and Rows cannot be 0 or negative.
 * 4 Columns maximum.
 * @param {number} size - the number of array size after split user input with ':'
 * @param {string} colStr - the string of requested columns
 * @param {string} rowStr - the string of requested rows
 */
export function validateTableRowAndColumnCount(size: number, colStr: string, rowStr: string) {
    const tableTextRegex = /^-?\d*$/;
    const col = tableTextRegex.test(colStr) ? Number.parseInt(colStr) : undefined;
    const row = tableTextRegex.test(rowStr) ? Number.parseInt(rowStr) : undefined;
    log.debug("Trying to create a table of: " + col + " columns and " + row + " rows.");

    if (col === undefined || row === undefined) {
        return undefined;
    }

    if (size !== 2 || isNaN(col) || isNaN(row)) {
        const errorMsg = "Please input the number of columns and rows as C:R e.g. 3:4";
        common.postWarning(errorMsg);
        return false;
    } else if (col <= 0 || row <= 0) {
        const errorMsg = "The number of rows or columns can't be zero or negative.";
        common.postWarning(errorMsg);
        return false;
    } else if (col > 4) {
        const errorMsg = "You can only insert up to four columns via Docs Markdown.";
        common.postWarning(errorMsg);
        return false;
    } else if (row > 50) {
        const errorMsg = "You can only insert up to 50 rows via Docs Markdown.";
        common.postWarning(errorMsg);
        return false;
    } else {
        return true;
    }
}

/**
 * Creates a string that represents a MarkDown table
 * @param {number} col - the number of columns in the table
 * @param {number} row - the number of rows in the table
 */
export function tableBuilder(col: number, row: number) {
    let str = "\n";

    /// create header
    // DCR update: 893410 [Add leading pipe]
    // tslint:disable-next-line:no-shadowed-variable
    for (let c = 1; c <= col; c++) {
        str += "|" + "Column" + c + "  |";
        // tslint:disable-next-line:no-shadowed-variable
        for (c = 2; c <= col; c++) {
            str += "Column" + c + "  |";
        }
        str += "\n";
    }

    // DCR update: 893410 [Add leading pipe]
    // tslint:disable-next-line:no-shadowed-variable
    for (let c = 1; c <= col; c++) {
        str += "|" + "---------" + "|";
        // tslint:disable-next-line:no-shadowed-variable
        for (c = 2; c <= col; c++) {
            str += "---------" + "|";
        }
        str += "\n";
    }

    /// create each row
    for (let r = 1; r <= row; r++) {
        str += "|" + "Row" + r + "     |";
        for (let c = 2; c <= col; c++) {
            str += "         |";
        }
        str += "\n";
    }

    log.debug("Table created: \r\n" + str);
    return str;
}

/**
 * Finds the files, then lets user pick from match list, if more than 1 match.
 * @param {string} searchTerm - the keyword to search directories for
 * @param {string} fullPath - optional, the folder to start the search under.
 */

export async function search(editor: TextEditor, selection: Selection, folderPath: string, fullPath?: string, crossReference?: string) {
    const dir = require("node-dir");
    const path = require("path");
    let language: string | null = "";
    let possibleLanguage: IHighlightLanguage | null = null;
    let selected: QuickPickItem | undefined;
    let activeFilePath;
    let snippetLink: string = "";
    if (!crossReference) {
        const searchTerm = await window.showInputBox({ prompt: "Enter snippet search terms." });
        if (!searchTerm) {
            return;
        }
        if (fullPath == null) {
            fullPath = folderPath;
        }

        // searches for all files at the given directory path.
        const files = await dir.promiseFiles(fullPath);
        const fileOptions: QuickPickItem[] = [];

        for (const file in files) {
            if (files.hasOwnProperty(file)) {
                const baseName: string = (path.parse(files[file]).base);
                const fileName: string = files[file];
                if (fileName.includes(searchTerm)) {
                    fileOptions.push({ label: baseName, description: fileName });
                }
            }
        }

        // select from all files found that match search term.
        selected = await window.showQuickPick(fileOptions);
        activeFilePath = (path.parse(editor.document.fileName).dir);
        if (!selected) {
            return;
        }
        const target = path.parse(selected.description);
        const relativePath = path.relative(activeFilePath, target.dir);

        possibleLanguage = inferLanguageFromFileExtension(target.ext);

        // change path separator syntax for commonmark
        snippetLink = path.join(relativePath, target.base).replace(/\\/g, "/");
    } else {
        const inputRepoPath = await window.showInputBox({ prompt: "Enter file path for Cross-Reference GitHub Repo" });
        if (inputRepoPath) {
            possibleLanguage = inferLanguageFromFileExtension(path.extname(inputRepoPath));
            snippetLink = `~/${crossReference}/${inputRepoPath}`;
        }
    }

    if (!!possibleLanguage) {
        language = possibleLanguage.aliases[0];
    }
    if (!language) {
        const supportedLanguages = getLanguageIdentifierQuickPickItems();
        const options: QuickPickOptions = {
            placeHolder: "Select a programming language (required)",
        };
        const qpSelection = await window.showQuickPick(supportedLanguages, options);
        if (!qpSelection) {
            common.postWarning("No code language selected. Abandoning command.");
            return;
        } else {
            const selectedLang = languages.find((lang) => lang.language === qpSelection.label);
            language = selectedLang ? selectedLang.aliases[0] : null;
        }
    }

    if (!language) {
        common.postWarning("Unable to determine language. Abandoning command.");
        return;
    }

    const selectionRange = new Range(selection.start.line, selection.start.character, selection.end.line, selection.end.character);
    const selectorOptions: QuickPickItem[] = [];
    selectorOptions.push({ label: "Id", description: "Select code by id tag (for example: <Snippet1>)" });
    selectorOptions.push({ label: "Range", description: "Select code by line range (for example: 1-15,18,20)" });
    selectorOptions.push({ label: "None", description: "Select entire file" });

    const choice = await window.showQuickPick(selectorOptions);
    if (choice) {
        let snippet: string;
        switch (choice.label.toLowerCase()) {
            case "id":
                const id = await window.showInputBox({ prompt: "Enter id to select" });
                if (id) {
                    snippet = snippetBuilder(language, snippetLink, id, undefined);
                    common.insertContentToEditor(editor, search.name, snippet, true, selectionRange);
                }
                break;
            case "range":
                const range = await window.showInputBox({ prompt: "Enter line selection range" });
                if (range) {
                    snippet = snippetBuilder(language, snippetLink, undefined, range);
                    common.insertContentToEditor(editor, search.name, snippet, true, selectionRange);
                }
                break;
            default:
                snippet = snippetBuilder(language, snippetLink);
                common.insertContentToEditor(editor, search.name, snippet, true, selectionRange);
                break;
        }
    }
}

export function inferLanguageFromFileExtension(fileExtension: string): IHighlightLanguage | null {
    const matches = languages.filter((lang) => {
        return lang.extensions
            ? lang.extensions.some((ext) => ext === fileExtension)
            : false;
    });

    if (matches && matches.length) {
        return matches[0];
    }

    return null;
}

export function internalLinkBuilder(isArt: boolean, pathSelection: string, selectedText: string = "", languageId?: string) {
    const os = require("os");
    let link = "";
    let startBrace = "";
    if (isArt) {
        startBrace = "![";
    } else {
        startBrace = "[";
    }

    // replace the selected text with the properly formatted link
    if (pathSelection === "") {
        link = `${startBrace}${selectedText}]()`;
    } else {
        link = `${startBrace}${selectedText}](${pathSelection})`;
    }

    const langId = languageId || "markdown";
    const isYaml = langId === "yaml" && !isArt;
    if (isYaml) {
        link = pathSelection;
    }

    // The relative path comparison creates an additional level that is not needed and breaks linking.
    // The path module adds an additional level so we'll need to handle this in our code.
    // Update slashes bug 944097.
    if (os.type() === "Windows_NT") {
        link = link.replace(/\\/g, "/");
    }

    if (isArt) {
        // Art links need backslashes to preview and publish correctly.
        link = link.replace(/\\/g, "/");
    }

    return link;
}

export function externalLinkBuilder(link: string, title: string = "") {
    if (title === "") {
        title = link;
    }

    const externalLink = `[${title}](${link})`;
    return externalLink;
}

export function videoLinkBuilder(link: string) {
    const videoLink = `> [!VIDEO ${link}]`;
    return videoLink;
}

export function includeBuilder(link: string, title: string) {
    // Include link syntax for reference: [!INCLUDE[sampleinclude](./includes/sampleinclude.md)]
    const include = `[!INCLUDE [${title}](${link})]`;
    return include;

}

export function snippetBuilder(language: string, relativePath: string, id?: string, range?: string) {
    if (id) {
        return `:::code language="${language}" source="${relativePath}" id=${id}":::`;
    } else if (range) {
        return `:::code language="${language}" source="${relativePath}" range="${range}":::`;
    } else {
        return `:::code language="${language}" source="${relativePath}":::`;
    }
}

/**
 * Strip out BOM from a string if presented, to prevent exception from JSON.parse function.
 * In Javascript, \uFEFF represents the Byte Order Mark (BOM).
 * @param originalText - the original string of text
 */
export function stripBOMFromString(originalText: string) {
    if (originalText === undefined) {
        return undefined;
    }

    return originalText.replace(/^\uFEFF/, "");
}

/**
 * Create child process.
 */
export function createChildProcess(path: any, args: any, options: any) {
    const spawn = require("child-process-promise").spawn;
    const promise = spawn(path, args, options);
    const childProcess = promise.childProcess;
    return childProcess;
}

const leftDblSmartQuoteRegExp = /\u201c/gm;    // “
const rightDblSmartQuoteRegExp = /\u201d/gm;    // ”
const leftSglSmartQuoteRegExp = /\u2018/gm;    // ‘
const rightSglSmartQuoteRegExp = /\u2019/gm;    // ’

interface IQuoteReplacement {
    expression: RegExp;
    replacement: string;
}

const smartQuoteToStandardMap: IQuoteReplacement[] = [
    { expression: leftDblSmartQuoteRegExp, replacement: '"' },
    { expression: rightDblSmartQuoteRegExp, replacement: '"' },
    { expression: leftSglSmartQuoteRegExp, replacement: "'" },
    { expression: rightSglSmartQuoteRegExp, replacement: "'" },
];

/**
 * Replaces smart quotes (`“, ”, ‘, and ’` such as those found in Word documents) with standard quotes.
 * @param event the event fired.
 */
export async function replaceSmartQuotes(event: TextDocumentChangeEvent) {
    if (!workspace.getConfiguration("markdown").replaceSmartQuotes) {
        return;
    }

    if (!!event && event.document) {
        const editor = window.activeTextEditor;
        if (editor && isMarkdownFileCheck(editor, false)) {
            const document = event.document;
            const content = document.getText();
            if (!!content) {
                const replacements: Replacements = [];
                smartQuoteToStandardMap.forEach((quoteReplacement: IQuoteReplacement) => {
                    const replacement = findReplacement(document, content, quoteReplacement.replacement, quoteReplacement.expression);
                    if (replacement) {
                        replacements.push(replacement);
                    }
                });
                await applyReplacements(replacements, editor);
            }
        }
    }

    return event;
}

export interface IReplacement {
    selection: Selection;
    value: string;
}

export type Replacements = IReplacement[];

export function findReplacement(document: TextDocument, content: string, value: string, expression?: RegExp): IReplacement | undefined {
    const result = expression ? expression.exec(content) : null;
    if (result !== null && result.length) {
        const match = result[0];
        if (match) {
            const index = result.index;
            const startPosition = document.positionAt(index);
            const endPosition = document.positionAt(index + match.length);
            const selection = new Selection(startPosition, endPosition);

            return { selection, value };
        }
    }

    return undefined;
}

export async function applyReplacements(replacements: Replacements, editor: TextEditor) {
    if (replacements) {
        await editor.edit((builder) => {
            replacements.forEach((replacement) =>
                builder.replace(
                    replacement.selection,
                    replacement.value));
        });
    }
}
