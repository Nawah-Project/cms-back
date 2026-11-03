import {blank,validateDocument,DomainError} from './relationship-document';
 describe('Relationships private contract',()=>{
 it('starts empty without participants or fabricated success',()=>{const d=blank();expect(validateDocument(d).people).toHaveLength(0);expect(d.learningEvidence).toHaveLength(0);});
 it('rejects owner and permission spoofing',()=>{expect(()=>validateDocument({...blank(),ownerId:'other'})).toThrow(DomainError);expect(()=>validateDocument({...blank(),permissions:{STRATEGIC_RELATIONSHIPS:'WRITE'}})).toThrow(DomainError);});
 it('bounds size and validates dates',()=>{const d=blank();d.settings.startDate='2026-02-30';expect(()=>validateDocument(d)).toThrow(DomainError);});
 it('rejects missing lists and unsafe URLs',()=>{const d=blank();d.people=undefined as any;expect(()=>validateDocument(d)).toThrow(DomainError);d.people=[];d.organizations=[{id:'org-test',name:'Synthetic',description:'',resources:[],url:'javascript:alert(1)'}];expect(()=>validateDocument(d)).toThrow(DomainError);});
 });
