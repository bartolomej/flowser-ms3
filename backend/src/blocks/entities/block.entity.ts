import { Column, Entity, ObjectID, ObjectIdColumn, } from 'typeorm';
import { PollingEntity } from '../../shared/entities/polling.entity';
import { CollectionGuarantee } from "./collection-guarantee.entity";

@Entity({name: 'blocks'})
export class Block extends PollingEntity {
    @ObjectIdColumn()
    _id: ObjectID;

    @Column()
    id: string;

    @Column()
    parentId: string;

    @Column()
    height: number;

    @Column()
    timestamp: string;

    @Column(type => CollectionGuarantee)
    collectionGuarantees: CollectionGuarantee[];

    @Column()
    blockSeals: any[];

    @Column()
    signatures: string[];
}
