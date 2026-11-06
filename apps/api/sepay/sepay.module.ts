import { Module } from '@nestjs/common';
import { SepayController } from './sepay.controller.js';
import { SepayService } from './sepay.services.js';

@Module({
  controllers: [SepayController],
  providers: [SepayService],
})
export class SepayModule {}