import { All, Controller, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from './auth.decorator';
import { auth } from './better-auth';

@Public()
@Controller('api/auth')
export class BetterAuthController {
  @All('*')
  async handleAuth(@Req() req: Request, @Res() res: Response) {
    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }

    const fetchReq = new Request(url, {
      method: req.method,
      headers,
      body: req.method !== 'GET' && req.method !== 'HEAD'
        ? JSON.stringify(req.body)
        : undefined,
    });

    const response = await auth.handler(fetchReq);

    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        res.append(key, value);
      } else {
        res.setHeader(key, value);
      }
    });

    const body = await response.text();
    if (body) res.send(body);
    else res.end();
  }
}
