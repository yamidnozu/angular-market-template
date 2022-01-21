import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
    AuthenticationService,
    InviteUserModel,
    InviteUserService,
    NativeLoginService,
    UserAccountTypesService,
} from '@openchannel/angular-common-services';
import { Subject } from 'rxjs';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { merge } from 'lodash';
import { LogOutService } from '@core/services/logout-service/log-out.service';
import { filter, finalize, map, takeUntil } from 'rxjs/operators';
import { AppFormField } from '@openchannel/angular-common-components';

@Component({
    selector: 'app-invited-signup',
    templateUrl: './invited-signup.component.html',
    styleUrls: ['./invited-signup.component.scss'],
})
export class InvitedSignupComponent implements OnInit, OnDestroy {
    userInviteData: InviteUserModel;
    isExpired = false;
    formConfig: any;
    formResultData: any;

    signUpGroup: FormGroup;

    inProcess = false;

    termsControl = new FormControl(false, Validators.requiredTrue);

    private destroy$: Subject<void> = new Subject();

    private passwordField = {
        id: 'password',
        label: 'Password',
        type: 'password',
        attributes: { required: true },
    };

    constructor(
        private activeRouter: ActivatedRoute,
        private router: Router,
        private inviteUserService: InviteUserService,
        private typeService: UserAccountTypesService,
        private logOutService: LogOutService,
        private nativeLoginService: NativeLoginService,
        private authService: AuthenticationService,
    ) {}

    ngOnInit(): void {
        this.checkSSO();
        this.getInviteDetails();
    }

    ngOnDestroy(): void {
        this.destroy$.next();
        this.destroy$.complete();
    }

    // making form config according to form type
    getFormType(type: string): void {
        if (type) {
            this.typeService
                .getUserAccountType(type)
                .pipe(takeUntil(this.destroy$))
                .subscribe(resp => {
                    this.formConfig = {
                        fields: this.mapDataToField(resp.fields),
                    };
                });
        } else {
            this.formConfig = {
                fields: [
                    {
                        id: 'name',
                        label: 'Name',
                        type: 'text',
                        attributes: { required: false },
                        defaultValue: this.userInviteData?.name,
                    },
                    {
                        id: 'email',
                        label: 'Email',
                        type: 'emailAddress',
                        attributes: { required: true },
                        defaultValue: this.userInviteData?.email,
                    },
                    this.passwordField,
                ],
            };
        }
    }

    // getting invitation details
    getInviteDetails(): void {
        const userToken = this.activeRouter.snapshot.params.token;
        if (userToken) {
            this.inviteUserService
                .getUserInviteInfoByToken(userToken)
                .pipe(takeUntil(this.destroy$))
                .subscribe(
                    response => {
                        this.userInviteData = response;
                        if (new Date(this.userInviteData.expireDate) < new Date()) {
                            this.isExpired = true;
                        } else {
                            this.getFormType(this.userInviteData.type);
                        }
                    },
                    () => {
                        this.router.navigate(['']).then();
                    },
                );
        } else {
            this.router.navigate(['']).then();
        }
    }

    mapDataToField(fields: AppFormField[]): AppFormField[] {
        const mappedFields = fields.map(field => {
            if (!field.id.includes('customData') && this.userInviteData[field.id]) {
                field.defaultValue = this.userInviteData[field.id];
            } else if (field.id.includes('company')) {
                field.defaultValue = this.userInviteData.customData?.company;
            }
            return field;
        });
        mappedFields.push(this.passwordField);

        return mappedFields;
    }

    // getting generated form group for disabling special fields
    setCreatedForm(form: FormGroup): void {
        form.get('email').disable();
        const companyControlKey = Object.keys(form.controls).find(key => key.includes('company'));
        if (companyControlKey) {
            form.controls[companyControlKey].disable();
        }
        this.signUpGroup = form;

        // add terms control into signup form
        this.signUpGroup.addControl('terms', this.termsControl);
    }

    // register invited user and deleting invite on success
    submitForm(): void {
        this.signUpGroup.markAllAsTouched();
        if (this.signUpGroup.valid && !this.inProcess) {
            this.inProcess = true;

            const request = merge(this.userInviteData, this.formResultData);
            delete request.terms;

            this.nativeLoginService
                .signupByInvite({
                    userCustomData: request,
                    inviteToken: this.userInviteData.token,
                })
                .pipe(takeUntil(this.destroy$))
                .subscribe(
                    () => {
                        this.logOutService
                            .logOut()
                            .pipe(
                                finalize(() => {
                                    this.inProcess = false;
                                    this.router.navigate(['signup'], { state: { showSignupFeedbackPage: true } }).then();
                                }),
                                takeUntil(this.destroy$),
                            )
                            .subscribe();
                    },
                    () => {
                        this.inProcess = false;
                    },
                );
        }
    }

    setFormData(resultData: any): void {
        this.formResultData = resultData;
    }

    private checkSSO(): void {
        this.authService
            .getAuthConfig()
            .pipe(
                map(value => !!value),
                filter(isSSO => isSSO),
                takeUntil(this.destroy$),
            )
            .subscribe(() => {
                this.router.navigate(['login']).then();
            });
    }
}
