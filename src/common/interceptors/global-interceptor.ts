import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, Observable } from "rxjs";
import { ApiResponse } from "../interfaces";

@Injectable()
export class GlobalInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {

    intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> | Promise<Observable<ApiResponse<T>>> {
        return next.handle().pipe(
            map((value: T) => {
                const statusCode = Number(context.switchToHttp().getResponse().statusCode);

                return {
                    data: value,
                    statusCode
                };
            })
        )
    }
}