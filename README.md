collatz visualizer

a web app for the math problem
it draws paths for numbers up to ten thousand
type a number and it moves the camera to the node
a light travels down the path to one
built with react and canvas

to use it locally
git clone the repository
cd app
npm install
npm run dev

to deploy it
get a cloudflare token
cd app
npm run build
npx wrangler pages deploy dist

the math rules
start with any number
if it is even cut it in half
if it is odd multiply by three and add one
it always goes to one
