# collatz-visualizer

a web app for the wholesome unsolved math problem

we draw a tree so you can type a number and it moves the camera to the node and then a light travels down the path to one

to use it locally you can git clone the repository then cd app and npm install and finally npm run dev

to deploy it you can get a cloudflare token and then cd app and npm run build and finally npx wrangler pages deploy dist

the math rules go we start with any number if it is even cut it in half if it is odd multiply by three and add one do that long enough and it always goes to one 
