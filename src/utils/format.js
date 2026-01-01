export const formatValidator = (schema) => {
    if(!errors || !errors.issues) return 'validation failed';
    if(Array.isArray(errors.issues.map)) return errors.issues.map(i=>i.message).join(', ');
    return JSON.stringify(errors);
};