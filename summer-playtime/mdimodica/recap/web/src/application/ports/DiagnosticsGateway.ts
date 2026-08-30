import type {DiagnosticCheck} from '@shared/contracts';

export type {DiagnosticCheck};

export interface DiagnosticsGateway {
	run(): Promise<readonly DiagnosticCheck[]>;
}
