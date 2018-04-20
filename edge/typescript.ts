import * as fs from 'fs'
import * as fp from 'path'
import * as cp from 'child_process'
import * as vscode from 'vscode'
import * as _ from 'lodash'
import * as ts from 'typescript'
import * as js from './javascript'

import FileWatcher from './FileWatcher'

export default class TypeScript implements vscode.DocumentLinkProvider {
	static support = ['typescript', 'typescriptreact'].map(name => ({ language: name }))

	provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
		const root = ts.createSourceFile('nada', document.getText(), ts.ScriptTarget.ESNext, true)
		const rootPath = vscode.workspace.getWorkspaceFolder(document.uri).uri.fsPath

		const links: vscode.DocumentLink[] = []

		root.forEachChild(node => {
			if (token && token.isCancellationRequested === true) {
				return undefined
			}

			if (node.kind === ts.SyntaxKind.ImportDeclaration) {
				const lead: number = _.result(node, 'moduleSpecifier.getStart')
				const stop: number = _.result(node, 'moduleSpecifier.getEnd')
				const span = new vscode.Range(getPosition(lead + 1), getPosition(stop - 1))

				const relativePath: string = _.get(node, 'moduleSpecifier.text')
				if (relativePath.startsWith('.')) {
					const fullPath = js.getImportFullPath(document.fileName, relativePath)
					if (!fullPath) {
						return undefined
					}
					links.push(new vscode.DocumentLink(span, vscode.Uri.file(fullPath)))

				} else if (js.nodeAPIs.test(relativePath)) {
					links.push(new vscode.DocumentLink(span, js.createUriForNodeAPI(relativePath)))

				} else {
					links.push(new vscode.DocumentLink(span, js.createUriForNPMModule(relativePath, rootPath)))
				}
			}
		})

		function getPosition(stop: number): vscode.Position {
			const text = document.getText().substring(0, stop)
			return new vscode.Position(
				_.get(text.match(/\n/g), 'length', 0) as number,
				stop - text.lastIndexOf('\n') - 1
			)
		}

		return links
	}

}
