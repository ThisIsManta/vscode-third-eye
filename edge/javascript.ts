import * as fs from 'fs'
import * as fp from 'path'
import * as vscode from 'vscode'
import * as babylon from 'babylon'
import * as _ from 'lodash'

export default class JavaScriptLinker implements vscode.DocumentLinkProvider {
	static support = ['javascript', 'javascriptreact'].map(name => ({ language: name }))

	provideDocumentLinks(document: vscode.TextDocument, cancellationToken: vscode.CancellationToken) {
		let rootNode
		try {
			rootNode = babylon.parse(document.getText(), {
				sourceType: 'module',
				plugins: ['jsx', 'flow', 'doExpressions', 'objectRestSpread', 'decorators', 'classProperties', 'exportExtensions', 'asyncGenerators', 'functionBind', 'functionSent', 'dynamicImport',]
			})

		} catch (ex) {
			console.error(ex)
			return null
		}

		const stubs: { start: { line: number, column: number }, end: { line: number, column: number }, path: string }[] = _.flatten([
			rootNode.program.body
				.filter(node => node.type === 'ImportDeclaration' && node.source.type === 'StringLiteral' && node.source.value.startsWith('.'))
				.map(node => ({ ...node.source.loc, path: node.source.value })),
			findRequireFunctions(rootNode)
				.filter(node => node.arguments[0].value.startsWith('.'))
				.map(node => ({ ...node.arguments[0].loc, path: node.arguments[0].value }))
		])
		const links: vscode.DocumentLink[] = []
		for (let index = 0; index < stubs.length; index++) {
			// Stop processing if it is cancelled
			if (cancellationToken && cancellationToken.isCancellationRequested === true) {
				return null
			}

			const stub = stubs[index]

			const highlight = new vscode.Range(stub.start.line - 1, stub.start.column + 1, stub.end.line - 1, stub.end.column - 1)

			let destination = fp.resolve(fp.dirname(document.fileName), stub.path)
			if (fs.existsSync(destination)) {
				if (fs.lstatSync(destination).isDirectory() && fs.existsSync(fp.join(destination, 'index.js'))) {
					destination = fp.join(destination, 'index.js')
				}

			} else if (fs.existsSync(destination + '.js')) {
				destination = destination + '.js'

			} else if (fs.existsSync(destination + '.jsx')) {
				destination = destination + '.jsx'

			} else {
				return null
			}

			links.push(new vscode.DocumentLink(highlight, vscode.Uri.file(destination)))
		}

		return links
	}
}

function findRequireFunctions(node, results = []) {
	if (_.get(node, 'type') === 'CallExpression' && _.get(node, 'callee.type') === 'Identifier' && _.get(node, 'callee.name') === 'require' && _.has(node, 'arguments') && _.get(node, 'arguments.0.type') === 'StringLiteral') {
		results.push(node)

	} else {
		const keys = Object.getOwnPropertyNames(node)
		for (let index = 0; index < keys.length; index++) {
			const name = keys[index]
			if (name === 'loc') {
				continue
			}

			const prop = node[name]
			if (_.isArray(prop)) {
				_.forEach(prop, innerNode => {
					findRequireFunctions(innerNode, results)
				})

			} else if (_.isObject(prop) && _.has(prop, 'type')) {
				findRequireFunctions(prop, results)
			}
		}
	}
	return results
}
