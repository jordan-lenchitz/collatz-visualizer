# collatz-visualizer

## a web app for [the wholesome unsolved math problem](https://en.wikipedia.org/wiki/Collatz_conjecture)
we plant and grow the tree after you pick a number and then a light travels down the path to one if you want or you can just explore freely

## the math
- start with any positive whole number
- if it is even cut it in half
- if it is odd multiply by three and add one
- keep doing this for each new number you get
- this seems to always goes to one
- no one really knows why

## local install
- `git clone git@github.com:jordan-lenchitz/collatz-visualizer.git`
- `cd app` 
- `npm install`
- `npm run dev`

## cloudflare deployment
- `export CLOUDFLARE_API_TOKEN="your_api_token"`
- `cd app`
- `npm run build`
- `npx wrangler pages deploy dist`
