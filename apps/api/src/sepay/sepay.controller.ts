import { Body, Controller, Headers, Inject, Post } from "@nestjs/common";
import { SepayService } from "./sepay.services.js";

@Controller("webhooks/sepay")
export class SepayController {
  constructor(@Inject(SepayService) private readonly service: SepayService) {}

  @Post()
  async receive(
    @Body() payload: unknown,
    @Headers("authorization") authorization: string | undefined,
  ) {
    const result = await this.service.receiveWebhook(payload, authorization);
    return { success: true, ...result };
  }
}
