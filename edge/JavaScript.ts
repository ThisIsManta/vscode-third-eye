import * as fs from 'fs'
import * as fp from 'path'
import * as cp from 'child_process'
import * as vscode from 'vscode'
import * as ts from 'typescript'
import sortBy from 'lodash/sortBy'
import memoize from 'lodash/memoize'
import isEqual from 'lodash/isEqual'
import isArrayLike from 'lodash/isArrayLike'

import FileWatcher from './FileWatcher'

export const nodeAPIs = new RegExp('^(addon|assert|buffer|child_process|cluster|console|crypto|dgram|dns|domain|events|fs|http|http|https|net|os|path|punycode|querystring|readline|repl|stream|string_decoder|timers|tls|tty|url|util|v8|vm|zlib)$')
const nodeVers = String(cp.execSync('node -v', { encoding: 'utf-8' })).trim()
export const createUriForNodeAPI = (name: string) => vscode.Uri.parse(`https://nodejs.org/dist/${nodeVers}/docs/api/${name}.html`)

interface Stub extends vscode.DocumentLink {
	coldPath: string
}

export default class JavaScript implements vscode.DocumentLinkProvider, vscode.ImplementationProvider {
	readonly id = ['javascript', 'javascriptreact', 'typescript', 'typescriptreact']

	provideDocumentLinks(document: vscode.TextDocument, cancellationToken: vscode.CancellationToken) {
		let root = parseTreeOrNull(document)
		if (root === null) {
			return null
		}

		const imports: Stub[] = []
		root.forEachChild(node => {
			if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
				imports.push({
					range: createRange(node.moduleSpecifier, document),
					coldPath: node.moduleSpecifier.text,
				})
			}
		})

		const requires: Stub[] = findNodes(
			root,
			node => {
				if (
					ts.isCallExpression(node) &&
					ts.isIdentifier(node.expression) &&
					node.expression.text === 'require' &&
					node.arguments.length === 1 &&
					ts.isStringLiteral(node.arguments[0])
				) {
					return node.arguments[0] as ts.StringLiteral
				}
			})
			.map(node => ({
				range: createRange(node, document),
				coldPath: node.text,
			} as Stub))
			.map(stub => {
				const pathRank = stub.coldPath.lastIndexOf('!') + 1
				if (pathRank > 0) {
					return {
						range: new vscode.Range(stub.range.start.translate({ characterDelta: pathRank }), stub.range.end),
						coldPath: stub.coldPath.substring(pathRank)
					}
				}

				return stub
			})

		const links: vscode.DocumentLink[] = []

		{ // Electrify imported files
			const stubs = [...imports, ...requires]
				.filter(stub => stub.coldPath.startsWith('.'))

			for (let stub of stubs) {
				// Stop processing if it is cancelled
				if (cancellationToken && cancellationToken.isCancellationRequested === true) {
					return null
				}

				const warmPath = getImportFullPath(document.fileName, stub.coldPath)
				if (warmPath) {
					stub.target = vscode.Uri.file(warmPath)
					links.push(stub)
				}
			}
		}

		{ // Electrify string-of-path files
			const RELATIVE_PATH_PATTERN = /^\.\.?\//

			const paths: Stub[] = findNodes(root,
				node => {
					if (ts.isStringLiteral(node) && RELATIVE_PATH_PATTERN.test(node.text)) {
						return node
					}
				})
				.map(node => ({
					range: createRange(node, document),
					coldPath: node.text
				}))
				.filter(stub => requires.some(item => isEqual(item, stub)) === false)

			for (let stub of paths) {
				// Stop processing if it is cancelled
				if (cancellationToken && cancellationToken.isCancellationRequested === true) {
					return null
				}

				const warmPath = fp.resolve(fp.dirname(document.fileName), stub.coldPath)

				if (FileWatcher.has(warmPath, FileWatcher.FILE)) {
					stub.target = vscode.Uri.file(warmPath)
					links.push(stub)
				}
			}
		}

		{ // Electrify Node.js APIs
			[...imports, ...requires]
				.filter(stub => nodeAPIs.test(stub.coldPath))
				.forEach(stub => {
					stub.target = createUriForNodeAPI(stub.coldPath)
					links.push(stub)
				})
		}

		// Electrify NPM modules
		const rootLink = vscode.workspace.getWorkspaceFolder(document.uri)
		if (rootLink) {
			const rootPath = rootLink.uri.fsPath

			const stubs = [...imports, ...requires]
				.filter(stub => nodeAPIs.test(stub.coldPath) === false && stub.coldPath.startsWith('.') === false)

			for (let stub of stubs) {
				// Stop processing if it is cancelled
				if (cancellationToken && cancellationToken.isCancellationRequested === true) {
					return null
				}

				const uri = createUriForNPMModule(stub.coldPath, rootPath)
				if (uri !== null) {
					links.push(new vscode.DocumentLink(stub.range, uri))
				}
			}
		}

		return links
	}

	provideImplementation(document: vscode.TextDocument, position: vscode.Position, cancellationToken: vscode.CancellationToken) {
		let root = parseTreeOrNull(document)
		if (root === null) {
			return null
		}

		let name: string
		for (const node of root.statements) {
			if (
				ts.isImportDeclaration(node) &&
				ts.isStringLiteral(node.moduleSpecifier) &&
				checkIfBetween(node.moduleSpecifier, position, document)
			) {
				name = node.moduleSpecifier.text
				break
			}
		}

		if (!name) {
			const requires = findNodes(
				root,
				node => {
					if (
						ts.isCallExpression(node) &&
						ts.isIdentifier(node.expression) &&
						node.expression.text === 'require' &&
						node.arguments.length === 1 &&
						ts.isStringLiteral(node.arguments[0]) &&
						checkIfBetween(node.arguments[0], position, document)
					) {
						return node.arguments[0] as ts.StringLiteral
					}
				})
			name = requires.length > 0 && requires[0].text
		}

		if (!name) {
			return null
		}

		const rootPath = vscode.workspace.getWorkspaceFolder(document.uri).uri.fsPath
		const packageJson = getPackageJson(name, rootPath)
		if ('main' in packageJson) {
			return new vscode.Location(
				vscode.Uri.file(fp.resolve(fp.join(rootPath, 'node_modules', name), packageJson.main)),
				new vscode.Position(0, 0)
			)
		}
	}
}

function parseTreeOrNull(document: vscode.TextDocument) {
	try {
		return ts.createSourceFile('temp', document.getText(), ts.ScriptTarget.ESNext, false)

	} catch (ex) {
		return null
	}
}

function findNodes<T extends ts.Node>(
	node: ts.Node,
	filter: (node: ts.Node) => T,
	visitedNodes = new Set<ts.Node>(), // Internal
	outputNodes: Array<T> = [] // Internal
) {
	if (visitedNodes.has(node)) {
		return outputNodes
	} else {
		visitedNodes.add(node)
	}

	const result = filter(node)
	if (result !== undefined) {
		outputNodes.push(result)

	} else {
		for (let name of Object.getOwnPropertyNames(node)) {
			const prop = node[name]
			if (isArrayLike(prop)) {
				for (const key in prop) {
					const innerNode = prop[key]
					findNodes(innerNode, filter, visitedNodes, outputNodes)
				}

			} else if (typeof prop === 'object' && 'kind' in prop) {
				findNodes(prop, filter, visitedNodes, outputNodes)
			}
		}
	}
	return outputNodes
}

function createRange(node: ts.Node, document: vscode.TextDocument) {
	const range = new vscode.Range(
		document.positionAt(node.pos),
		document.positionAt(node.end),
	)
	const text = document.getText(range)
	return new vscode.Range(
		range.start.translate({ characterDelta: text.length - text.replace(/^(\s|'|")*/, '').length }),
		range.end.translate({ characterDelta: -text.length + text.replace(/(\s|'|")*$/, '').length }),
	)
}

interface PackageJson {
	name: string
	version: string
	main?: string
	homepage?: string
	repository?: string | { url: string }
}

function getPackageJson(name: string, rootPath: string): PackageJson | null {
	const path = fp.join(rootPath, 'node_modules', name, 'package.json')
	if (FileWatcher.has(path)) {
		try {
			return JSON.parse(fs.readFileSync(path, 'utf-8'))

		} catch (ex) {
			console.error(ex)
		}
	}
	return null
}

export const createUriForNPMModule: (name: string, rootPath: string) => vscode.Uri = memoize((name: string, rootPath: string) => {
	const packageJson = getPackageJson(name, rootPath)
	if (packageJson === null) {
		return null
	}

	if (typeof packageJson.homepage === 'string') {
		return vscode.Uri.parse(packageJson.homepage)

	} else if (typeof packageJson.repository === 'string' && packageJson.repository.includes(':') === false) {
		return vscode.Uri.parse('https://github.com/' + packageJson.repository)

	} else if (typeof packageJson.repository === 'object' && typeof packageJson.repository.url === 'string') {
		return vscode.Uri.parse(packageJson.repository.url)

	} else {
		return vscode.Uri.parse('https://www.npmjs.com/package/' + name)
	}
}, (name: string, rootPath: string) => rootPath + '|' + name)

function checkIfBetween(location: ts.TextRange, position: vscode.Position, document: vscode.TextDocument) {
	if (!location) return false

	const offset = document.offsetAt(position)
	return location.pos >= offset && offset <= location.end
}

function getSupportedExtensions(currentFullPath: string) {
	const currentExtension = fp.extname(currentFullPath)
	return sortBy(['.ts', '.tsx', '.js', '.jsx'], extension => currentExtension.endsWith('x') && extension.endsWith('x') ? 0 : 1)
}

// Note that this function is copied from eslint-plugin-levitate/edge/use-import-name-after-file-or-directory-name.js
export function getImportFullPath(currentFullPath: string, importRelativePath: string) {
	const supportedExtensions = getSupportedExtensions(currentFullPath)

	const fullPath = fp.resolve(fp.dirname(currentFullPath), importRelativePath)

	if (FileWatcher.has(fullPath)) {
		if (FileWatcher.has(fullPath, FileWatcher.DIRECTORY)) {
			for (const extension of supportedExtensions) {
				const actualPath = fp.join(fullPath, 'index' + extension)
				if (FileWatcher.has(actualPath)) {
					return actualPath
				}
			}
		}

		return fullPath
	}

	for (const extension of supportedExtensions) {
		if (FileWatcher.has(fullPath + extension)) {
			return fullPath + extension
		}
	}

	return null
}
