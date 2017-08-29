import * as fs from 'fs'
import * as fp from 'path'
import * as vscode from 'vscode'

import Go from './go'
const go = new Go()

import JavaScript from './javascript'
const javaScript = new JavaScript()

import Stylus from './stylus'
const stylus = new Stylus()

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(Go.support, go))

	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(JavaScript.support, javaScript))
	context.subscriptions.push(vscode.languages.registerImplementationProvider(JavaScript.support, javaScript))
	
	context.subscriptions.push(vscode.languages.registerDocumentLinkProvider(Stylus.support, stylus))
}

export function deactivate() { }