import {handleApi} from '../lib/upstream.js';
export default function handler(req,res){return handleApi('schedule',req,res);}
