import * as fs from 'fs'
import * as fp from 'path'
import * as cp from 'child_process'
import * as vscode from 'vscode'
import * as babylon from 'babylon'
import * as _ from 'lodash'

const nodeAPIs = new RegExp('^(addon|assert|buffer|child_process|cluster|console|crypto|dgram|dns|domain|events|fs|http|http|https|net|os|path|punycode|querystring|readline|repl|stream|string_decoder|timers|tls|tty|url|util|v8|vm|zlib)$')
const nodeVers = String(cp.execSync('node -v', { encoding: 'utf-8' })).trim()
const createUriForNodeAPI = (name: string) => vscode.Uri.parse(`https://nodejs.org/dist/${nodeVers}/docs/api/${name}.html`)

interface Stub {
	span: vscode.Range
	path: string
	node: any
}

export default class JavaScriptLinker implements vscode.DocumentLinkProvider {

	static support = ['javascript', 'javascriptreact'].map(name => ({ language: name }))

	provideDocumentLinks(document: vscode.TextDocument, cancellationToken: vscode.CancellationToken) {
		let root
		try {
			root = babylon.parse(document.getText(), {
				sourceType: 'module',
				plugins: ['jsx', 'flow', 'doExpressions', 'objectRestSpread', 'decorators', 'classProperties', 'exportExtensions', 'asyncGenerators', 'functionBind', 'functionSent', 'dynamicImport',]
			})

		} catch (ex) {
			console.error(ex)
			return null
		}

		const imports: Stub[] = root.program.body
			.filter(node => node.type === 'ImportDeclaration' && node.source.type === 'StringLiteral' && node.source.value)
			.map(node => ({ span: createRange(node.source.loc), path: node.source.value, node }))

		const requires: Stub[] = findNodes(root, node =>
			_.get(node, 'type') === 'CallExpression' &&
			_.get(node, 'callee.type') === 'Identifier' &&
			_.get(node, 'callee.name') === 'require' &&
			_.has(node, 'arguments') &&
			_.get(node, 'arguments.0.type') === 'StringLiteral')
			.map(node => ({ span: createRange(node.arguments[0].loc), path: node.arguments[0].value, node }))

		const links: vscode.DocumentLink[] = []

		{ // Electrify imported files
			const stubs = [...imports, ...requires]
				.filter(stub => stub.path.startsWith('.'))

			for (let stub of stubs) {
				// Stop processing if it is cancelled
				if (cancellationToken && cancellationToken.isCancellationRequested === true) {
					return null
				}

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

				links.push(new vscode.DocumentLink(stub.span, vscode.Uri.file(destination)))
			}
		}

		{ // Electrify function-called files
			const calls: { span: vscode.Range, path: string }[] = _.flatten(findNodes(root,
				node =>
					_.get(node, 'type') === 'CallExpression' &&
					node.arguments.length > 0,
				node =>
					node.arguments
						.filter(node => node.type === 'StringLiteral' && node.value.startsWith('./'))
						.map(node => ({ span: createRange(node.loc), path: node.value }))
			))

			for (let stub of calls) {
				// Stop processing if it is cancelled
				if (cancellationToken && cancellationToken.isCancellationRequested === true) {
					return null
				}

				let destination = fp.resolve(fp.dirname(document.fileName), stub.path)
				if (fs.existsSync(destination) && fs.lstatSync(destination).isFile()) {
					links.push(new vscode.DocumentLink(stub.span, vscode.Uri.file(destination)))
				}
			}
		}

		{ // Electrify Node.js APIs
			[...imports, ...requires]
				.filter(stub => nodeAPIs.test(stub.path))
				.forEach(stub => {
					links.push(new vscode.DocumentLink(stub.span, createUriForNodeAPI(stub.path)))
				})
		}

		{ // Electrify NPM modules
			const stubs = [...imports, ...requires]
				.filter(stub => nodeAPIs.test(stub.path) === false && stub.path.startsWith('.') === false)

			for (let stub of stubs) {
				// Stop processing if it is cancelled
				if (cancellationToken && cancellationToken.isCancellationRequested === true) {
					return null
				}

				const uri = createUriForNPMModule(stub.path)
				if (uri !== null) {
					links.push(new vscode.DocumentLink(stub.span, uri))
				}
			}
		}

		return links
	}
}

function findNodes(node, filter: (node) => boolean, selector = node => node, results = []): any[] {
	if (filter(node) === true) {
		results.push(selector(node))

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
					findNodes(innerNode, filter, selector, results)
				})

			} else if (_.isObject(prop) && _.has(prop, 'type')) {
				findNodes(prop, filter, selector, results)
			}
		}
	}
	return results
}

function createRange(location) {
	return new vscode.Range(location.start.line - 1, location.start.column + 1, location.end.line - 1, location.end.column - 1)
}

const createUriForNPMModule: (name: string) => vscode.Uri = _.memoize(name => {
	const path = fp.join(vscode.workspace.rootPath, 'node_modules', name, 'package.json')
	if (fs.existsSync(path)) {
		try {
			const file = fs.readFileSync(path, 'utf-8')
			const pack = JSON.parse(file)
			if (_.isString(pack.homepage)) {
				return vscode.Uri.parse(pack.homepage)

			} else if (_.has(pack.repository.url)) {
				return vscode.Uri.parse(pack.repository.url)

			} else if (_.isString(pack.repository) && pack.repository.includes(':') === false) {
				return vscode.Uri.parse('https://github.com/' + pack.repository)

			} else {
				return vscode.Uri.parse('https://www.npmjs.com/package/' + name)
			}

		} catch (ex) {
			console.error(ex)
		}
	}
	return null
})
