import {
    ConflictException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { MongoRepository } from 'typeorm';
import { Project } from './entities/project.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { FlowGatewayService } from "../flow/services/flow-gateway.service";
import { FlowAggregatorService } from "../flow/services/flow-aggregator.service";
import { FlowEmulatorService } from "../flow/services/flow-emulator.service";
import { AccountsService } from "../accounts/services/accounts.service";
import { BlocksService } from "../blocks/blocks.service";
import { EventsService } from "../events/events.service";
import { LogsService } from "../logs/logs.service";
import { TransactionsService } from "../transactions/transactions.service";
import { plainToClass } from "class-transformer";

@Injectable()
export class ProjectsService {

    private currentProject: Project;

    constructor (
        @InjectRepository(Project)
        private projectRepository: MongoRepository<Project>,
        private flowGatewayService: FlowGatewayService,
        private flowAggregatorService: FlowAggregatorService,
        private flowEmulatorService: FlowEmulatorService,
        private accountsService: AccountsService,
        private blocksService: BlocksService,
        private eventsService: EventsService,
        private logsService: LogsService,
        private transactionsService: TransactionsService
    ) {
    }

    getCurrentProject () {
        if (this.currentProject) {
            return this.currentProject;
        } else {
            throw new NotFoundException("No current project")
        }
    }

    async unUseProject () {
        this.currentProject = undefined;
        this.flowAggregatorService.configureProjectContext(this.currentProject);
        this.flowGatewayService.configureDataSourceGateway(this.currentProject?.gateway);
        await this.flowAggregatorService.stopEmulator();
    }

    async useProject (id: string) {
        this.currentProject = await this.findOne(id);

        // user may have previously used a custom emulator project
        // make sure that in any running emulators are stopped
        await this.flowAggregatorService.stopEmulator();

        // update project context
        this.flowGatewayService.configureDataSourceGateway(this.currentProject?.gateway);
        this.flowAggregatorService.configureProjectContext(this.currentProject);

        if (this.currentProject.emulator) {
            this.flowEmulatorService.configureProjectContext(this.currentProject)
            await this.flowAggregatorService.startEmulator()
                .catch(async e => {
                    await this.unUseProject();
                    throw new ServiceUnavailableException(
                        `Can not start emulator with project id ${id}`,
                        e.message
                    )
                })
        }

        if (
            !this.currentProject.isOfficialNetwork() &&
            !await this.flowGatewayService.isConnectedToGateway()
        ) {
            await this.unUseProject();
            throw new ServiceUnavailableException("Emulator not accessible")
        }

        try {
            await Promise.all([
                this.accountsService.removeAll(),
                this.blocksService.removeAll(),
                this.eventsService.removeAll(),
                this.logsService.removeAll(),
                this.transactionsService.removeAll()
            ])
        } catch (e) {
            throw new InternalServerErrorException("Project cleanup failed")
        }

        console.debug(`[Flowser] using project: ${id}`);

        return this.currentProject;
    }

    async seedAccounts (id: string, n: number) {
        if (this.currentProject.id === id) {
            return this.flowEmulatorService.initialiseAccounts(n);
        } else {
            throw new ConflictException("This project is not currently used.")
        }
    }

    create (createProjectDto: CreateProjectDto) {
        return this.projectRepository.save(createProjectDto).catch(this.handleMongoError);
    }

    async findAll (): Promise<Project[]> {
        const projects = await this.projectRepository.find({
            order: { updatedAt: "DESC" }
        });
        return Promise.all(projects.map(async project => {
            if (project.gateway) {
                const { address, port } = project.gateway;
                const pingable = project.isOfficialNetwork() || await FlowGatewayService.isPingable(address, port)
                return plainToClass(Project, { ...project, pingable });
            } else {
                return project
            }
        }))
    }

    async findOne (id: string): Promise<Project> {
        const project = await this.projectRepository.findOne({ id });
        if (!project) {
            throw new NotFoundException("Project not found")
        }

        if (project.gateway) {
            const { port, address } = project.gateway;
            const pingable = project.isOfficialNetwork() || await FlowGatewayService.isPingable(address, port)
            return plainToClass(Project, { ...project, pingable });
        } else {
            return project;
        }
    }

    async update (id: string, updateProjectDto: UpdateProjectDto) {
        return this.projectRepository.findOneAndUpdate({ id },
            { $set: { ...updateProjectDto, updatedAt: new Date().getTime() } },
            { upsert: true, returnOriginal: false })
            .then(res => res.value).catch(this.handleMongoError);
    }

    remove (id: string) {
        return this.projectRepository.delete({ id });
    }

    private handleMongoError (error) {
        switch (error.code) {
            case 11000:
                throw new ConflictException("Project name already exists")
            default:
                throw new InternalServerErrorException(error.message)
        }
    }
}
