import * as fs from 'fs'
import * as fp from 'path'
import * as os from 'os'
import * as vscode from 'vscode'
import get from 'lodash/get'

import FileWatcher from './FileWatcher'

const standardLibrary = new RegExp('^(archive|archive/tar|archive/zip|bufio|builtin|bytes|compress|compress/bzip2|compress/flate|compress/gzip|compress/lzw|compress/zlib|container|container/heap|container/list|container/ring|context|crypto|crypto/aes|crypto/cipher|crypto/des|crypto/dsa|crypto/ecdsa|crypto/elliptic|crypto/hmac|crypto/md5|crypto/rand|crypto/rc4|crypto/rsa|crypto/sha1|crypto/sha256|crypto/sha512|crypto/subtle|crypto/tls|crypto/x509|crypto/x509/pkix|database|database/sql|database/sql/driver|debug|debug/dwarf|debug/elf|debug/gosym|debug/macho|debug/pe|debug/plan9obj|encoding|encoding/ascii85|encoding/asn1|encoding/base32|encoding/base64|encoding/binary|encoding/csv|encoding/gob|encoding/hex|encoding/json|encoding/pem|encoding/xml|errors|expvar|flag|fmt|go|go/ast|go/build|go/constant|go/doc|go/format|go/importer|go/parser|go/printer|go/scanner|go/token|go/types|hash|hash/adler32|hash/crc32|hash/crc64|hash/fnv|html|html/template|image|image/color|image/color/palette|image/draw|image/gif|image/jpeg|image/png|index|index/suffixarray|io|io/ioutil|log|log/syslog|math|math/big|math/bits|math/cmplx|math/rand|mime|mime/multipart|mime/quotedprintable|net|net/http|net/http/cgi|net/http/cookiejar|net/http/fcgi|net/http/httptest|net/http/httptrace|net/http/httputil|net/http/pprof|net/mail|net/rpc|net/rpc/jsonrpc|net/smtp|net/textproto|net/url|os|os/exec|os/signal|os/user|path|path/filepath|plugin|reflect|regexp|regexp/syntax|runtime|runtime/cgo|runtime/debug|runtime/msan|runtime/pprof|runtime/race|runtime/trace|sort|strconv|strings|sync|sync/atomic|syscall|testing|testing/iotest|testing/quick|text|text/scanner|text/tabwriter|text/template|text/template/parse|time|unicode|unicode/utf16|unicode/utf8|unsafe)$')

const GOPATH = get(process.env, 'GOPATH', fp.join(os.homedir(), 'go', 'src'))

export default class Go implements vscode.DocumentLinkProvider {
	readonly id = 'go'

	provideDocumentLinks(document: vscode.TextDocument, cancellationToken: vscode.CancellationToken) {
		const text = document.getText()
		const feed = text.split(/\n/)

		const links: vscode.DocumentLink[] = []

		let mark = 0
		while (mark >= 0 && mark < text.length) {
			if (skipComments()) {
				continue

			} else if (text.substring(mark, mark + 7) === 'import ') {
				mark += 7

				let foundParenthesis = false
				while (mark >= 0 && mark < text.length) {
					if (skipComments()) {
						continue

					} else if (text.charAt(mark) === '(') {
						mark += 1
						foundParenthesis = true

					} else if (text.charAt(mark) === ')' && foundParenthesis) {
						mark += 1
						break

					} else if (text.charAt(mark) === '"') {
						const leadMark = mark + 1
						const leadPost = getLineNumber(leadMark)
						const stopMark = text.indexOf('"', leadMark)
						const stopPost = getLineNumber(stopMark)
						mark = stopMark + 1

						const name = text.substring(leadMark, stopMark)
						const posn = new vscode.Range(leadPost, stopPost)

						if (standardLibrary.test(name)) { // Link to GoLang.org
							links.push(new vscode.DocumentLink(posn, vscode.Uri.parse('https://golang.org/pkg/' + name)))

						} else {
							const file = getLocalFileUriOrNull(name)
							if (file !== null) { // Link to the local source file
								links.push(new vscode.DocumentLink(posn, file))

							} else if (name.startsWith('github.com/')) { // Link to GitHub.com
								const path = name.split('/')
								if (path.length > 3) {
									path.splice(3, 0, 'tree', 'master')
								}
								links.push(new vscode.DocumentLink(posn, vscode.Uri.parse('https://' + path.join('/'))))

							} else {
								links.push(new vscode.DocumentLink(posn, vscode.Uri.parse('https://' + name)))
							}
						}

						if (foundParenthesis === false) {
							break
						}

					} else {
						mark += 1
					}
				}

			} else {
				mark += 1
			}
		}

		function skipComments() {
			if (text.substring(mark, mark + 2) === '/*') {
				mark = text.indexOf('*/', mark) + 2
				return true
			}

			if (text.substring(mark, mark + 2) === '//') {
				mark = text.indexOf('\n', mark) + 1
				return true
			}

			return false
		}

		function getLineNumber(mark: number): vscode.Position {
			let readChar = 0
			let lineRank = 0
			do {
				if (mark >= readChar && mark <= readChar + feed[lineRank].length) {
					return new vscode.Position(lineRank, mark - readChar)
				}
				readChar += feed[lineRank].length + 1
				lineRank += 1
			} while (lineRank < feed.length)

			throw 'Could not determine line number of offset ' + mark
		}

		return links
	}
}

function getLocalFileUriOrNull(name: string): vscode.Uri | null {
	try {
		const path = fp.join(GOPATH, name.replace(/\//g, fp.sep))
		if (FileWatcher.has(path, FileWatcher.DIRECTORY)) {
			const list = fs.readdirSync(path).filter(file => fp.extname(file) === '.go')
			if (list.length >= 1) {
				return vscode.Uri.file(fp.join(path, list[0]))
			}
		}

	} catch (ex) {
		console.error(ex)
	}

	return null
}
