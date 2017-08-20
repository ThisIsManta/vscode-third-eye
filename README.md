**Third Eye** is a Visual Studio Code extension for jumping through files effortlessly.

Once the extension is installed, all supported file paths will be underlined, so you can open the file by pressing *Ctrl* key and click it.

![Demo](docs/demo.gif)

Currently, the extension supports the following patterns:  
- **JavaScript** and **JavaScript React**
  ```js
  import * as named from './file.js'
  import './file.js'
  require('./file.js')
  ```
- **Stylus**
  ```stylus
  @import './file.styl'
  @require './file.styl'
  ```
