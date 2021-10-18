import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { Block } from './entities/block.entity';
import { CreateBlockDto } from './dto/create-block.dto';
import { UpdateBlockDto } from './dto/update-block.dto';
import { NotFoundException } from "@nestjs/common";

export class BlocksService {

    constructor(@InjectRepository(Block)
                private blockRepository: MongoRepository<Block>) {
    }

    async create(createBlockDto: CreateBlockDto): Promise<Block> {
        return this.blockRepository.save(createBlockDto);
    }

    findAll(): Promise<Block[]> {
        return this.blockRepository.find();
    }

    findAllNewerThanTimestamp(timestamp): Promise<Block[]> {
        return this.blockRepository.find({
            where: {createdAt: {$gt: timestamp}}
        });
    }

    findLastBlock(): Promise<Block> {
        return this.blockRepository.findOne({
            order: {height: 'DESC'},
        });
    }

    async findOne(id: string) {
        const [block] = await this.blockRepository.find({ where: {_id: id} });
        if (block) {
            return block;
        } else {
            throw new NotFoundException("Block not found")
        }
    }

    update(id: string, updateBlockDto: UpdateBlockDto) {
        return `This action updates a #${id} block`;
    }

    remove(id: string) {
        return `This action removes a #${id} block`;
    }
}