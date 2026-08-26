import { BadRequestException, ConflictException, Controller, Get } from "@nestjs/common";


@Controller('test')
export class TestController {

    @Get()
    findAll(){
        const toto = {id: 1} as any
        //console.log(toto.name.toto)
        return toto.name.toto;
        return {toto: 10}
    }
}