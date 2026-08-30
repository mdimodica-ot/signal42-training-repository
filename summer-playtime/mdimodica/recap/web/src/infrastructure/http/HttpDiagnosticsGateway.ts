import type {DiagnoseResponse} from '@shared/contracts';
import type {DiagnosticCheck, DiagnosticsGateway} from '@/application/ports/DiagnosticsGateway';
import {getJson} from './json';

export class HttpDiagnosticsGateway implements DiagnosticsGateway {
	async run(): Promise<readonly DiagnosticCheck[]> {
		const dto = await getJson<DiagnoseResponse>('/api/diagnose');
		return dto.checks;
	}
}
