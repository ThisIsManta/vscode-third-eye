import * as vscode from 'vscode'

import Go from './go'
import JavaScript from './JavaScript'
import TypeScript from './TypeScript'
import Stylus from './Stylus'
import FileWatcher from './FileWatcher'

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
}

export function deactivate() {
	FileWatcher.dispose()
}
