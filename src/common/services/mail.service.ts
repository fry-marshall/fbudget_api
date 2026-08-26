import { MailerService } from "@nestjs-modules/mailer";
import { Injectable } from "@nestjs/common";
import { MailOptions } from "../interfaces";

@Injectable()
export class MailService {
    constructor(private mailerService: MailerService){}

    async sendMail(mailOptions: MailOptions){
        return await this.mailerService.sendMail({
            to: mailOptions.receiver,
            subject: mailOptions.subject,
            template: mailOptions.template,
            context: mailOptions.context
        })
    }
}