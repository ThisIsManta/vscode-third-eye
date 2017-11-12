import * as fs from 'fs'
import * as fp from 'path'
import * as vscode from 'vscode'
import * as _ from 'lodash'

import Go from './go'
import JavaScript from './javascript'
import TypeScript from './typescript'
import Stylus from './stylus'

export function activate(context: vscode.ExtensionContext) {
	const go = new Go()
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(Go.support, go))

	const javaScript = new JavaScript()
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(JavaScript.support, javaScript))
	context.subscriptions.push(vscode.languages.registerImplementationProvider(JavaScript.support, javaScript))

	const typeScript = new TypeScript()
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(TypeScript.support, typeScript))

	const stylus = new Stylus()
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(Stylus.support, stylus))

	let openingEditors: Array<vscode.TextEditor> = []

	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(activeEditor => {
		if (openingEditors.indexOf(activeEditor) >= 0) {
			openingEditors.splice(openingEditors.indexOf(activeEditor), 1)
		}
		openingEditors.unshift(activeEditor)
		if (openingEditors.length > 10) {
			openingEditors = _.take(openingEditors, 10)
		}
	}))

	context.subscriptions.push(vscode.commands.registerCommand('thirdEye.openRecent', () => {
		const recentEditor = _.last(openingEditors.slice(0, 2))
		if (recentEditor) {
			vscode.window.showTextDocument(recentEditor.document, recentEditor.viewColumn)
		}
	}))

	context.subscriptions.push(vscode.commands.registerCommand('thirdEye.openSimilar', async () => {
		if (!vscode.window.activeTextEditor) {
			return null
		}

		const fileLink = vscode.window.activeTextEditor.document.uri
		const rootLink = vscode.workspace.getWorkspaceFolder(fileLink)
		if (!rootLink) {
			return null
		}

		const filePath = vscode.window.activeTextEditor.document.uri.fsPath
		const fileName = fp.basename(filePath)
		if (fileName.startsWith('.') || fileName.includes('.') === false) {
			return null
		}

		const relaPath = filePath.substring(rootLink.uri.fsPath.length)
		const dirxPath = fp.dirname(relaPath)
		const lazyName = fileName.replace(/\..+/, '')
		const lazyPath = (dirxPath + '/' + lazyName).replace(/\\/g, '/').replace(/^\//, '')

		const fileList = await vscode.workspace.findFiles(lazyPath + '.*')
		const selxRank = fileList.findIndex(nextLink => nextLink.fsPath === fileLink.fsPath)
		if (selxRank >= 0) {
			const nextLink = fileList.concat(fileList)[selxRank + 1]
			vscode.window.showTextDocument(nextLink)
		}
	}))

	context.subscriptions.push(vscode.commands.registerCommand('thirdEye.openPackage', () => {
		if (!vscode.window.activeTextEditor) {
			return null
		}

		const fileLink = vscode.window.activeTextEditor.document.uri
		const rootLink = vscode.workspace.getWorkspaceFolder(fileLink)
		if (!rootLink) {
			return null
		}

		const packPath = fp.join(rootLink.uri.fsPath, 'package.json')
		if (fs.existsSync(packPath)) {
			vscode.window.showTextDocument(vscode.Uri.file(packPath))
		} else {
			vscode.window.showErrorMessage('Third Eye: package.json file could not be found in your workspace root directory.')
		}
	}))
}
