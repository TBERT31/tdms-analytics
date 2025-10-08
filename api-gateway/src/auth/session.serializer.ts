import { PassportSerializer } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
@Injectable()
export class SessionSerializer extends PassportSerializer {
  serializeUser(user: any, done: (err: any, user?: any) => void): any {
    done(null, user);
  }
  deserializeUser(
    payload: string | undefined,
    done: (err: any, payload?: string) => void,
  ): any {
    done(null, payload);
  }
}