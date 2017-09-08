import * as fs from 'fs'
import * as fp from 'path'
import * as cp from 'child_process'
import * as vscode from 'vscode'
import * as babylon from 'babylon'
import * as _ from 'lodash'
import * as ts from 'typescript'
import * as js from './javascript'


export default class TypeScript implements vscode.DocumentLinkProvider {
	static support = ['typescript', 'typescriptreact'].map(name => ({ language: name }))

	provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentLink[]> {
		const root = ts.createSourceFile('nada', document.getText(), ts.ScriptTarget.ESNext, true)

		const links: vscode.DocumentLink[] = []

		root.forEachChild(node => {
			if (node.kind === ts.SyntaxKind.ImportDeclaration) {
				const name: string = _.get(node, 'moduleSpecifier.text')
				if (name.startsWith('.')) {
					return null
				}

				const lead: number = _.result(node, 'moduleSpecifier.getStart')
				const stop: number = _.result(node, 'moduleSpecifier.getEnd')
				const span = new vscode.Range(getPosition(lead + 1), getPosition(stop - 1))
				if (js.nodeAPIs.test(name)) {
					links.push(new vscode.DocumentLink(span, js.createUriForNodeAPI(name)))

				} else {
					links.push(new vscode.DocumentLink(span, js.createUriForNPMModule(name)))
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
