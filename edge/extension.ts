import * as fs from 'fs'
import * as fp from 'path'
import * as vscode from 'vscode'

import JavaScript from './javascript'
import Stylus from './stylus'

const javaScript = new JavaScript()
const stylus = new Stylus()

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(JavaScript.support, javaScript))
	context.subscriptions.push(vscode.languages.registerImplementationProvider(JavaScript.support, javaScript))
	
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(Stylus.support, stylus))
}

export function deactivate() { }