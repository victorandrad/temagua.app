import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { recadoNoConsole } from './app/easter-egg';

recadoNoConsole();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
