import * as dotenv from 'dotenv'
import * as findConfig from 'find-config'
dotenv.config(findConfig('.env'));