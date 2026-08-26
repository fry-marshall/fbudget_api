import { Controller, Get, HttpCode } from '@nestjs/common';
import { AppService } from './app.service';

/* @Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
} */


@Controller('.well-known/appspecific')
export class AppController {
  @Get('com.chrome.devtools.json')
  @HttpCode(200)
  handleChromeDevTools() {
    return {}; // Returns an empty JSON configuration
  }
}
