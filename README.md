**Third Eye** is a Visual Studio Code extension that helps jumping through files effortlessly.

## Basic usage

Once the extension is installed, all supported file paths will be underlined, so you can open the file by pressing *Ctrl* key and click it.

![Demo](docs/demo.gif)

Currently, the extension supports the following patterns:  
- **Go**
  ```go
  import (
    "fmt"
    "golang.org/x/net/context"
    "github.com/go-kit/kit/log"
    "my/local/project"
  )
  ```
- **JavaScript** and **JavaScript React**
  ```js
  import * as named from './file.js'
  import './file.js'
  require('./file.js')
  ```

  The below will open https://nodejs.org/api/fs.html in your browser and so does apply to all native Node.js APIs.
  ```js
  var fs = require('fs')
  ```

  In addition to `require`, any static file path in a function-call can be electrified as well.
  ```js
  var file = fs.readFileSync('./file.js', 'utf-8')
  var doSomething = function () {}
  doSomething('./file.js')
  ```
  The below will open either its homepage, repository, or NPM page. Clicking _Go > Go to Implementation_ menu will bring you the actual code in your local `node_modules` directory.
  ```js
  import something from 'thrid-party-npm-module'
  ```
- **TypeScript** and **TypeScript React**
  ```typescript
  import * as named from './file.js'
  import './file.js'
  ```

  The below will open https://nodejs.org/api/fs.html in your browser and so does apply to all native Node.js APIs.
  ```typescript
  import * as named from 'fs'
  ```

  The below will open either its homepage, repository, or NPM page.
  ```typescript
  import something from 'thrid-party-npm-module'
  ```
- **Stylus**
  ```stylus
  @import './file.styl'
  @require './file.styl'
  ```
